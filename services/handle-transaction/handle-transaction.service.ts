/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
'use strict';
import { Config } from '../../common';
import { Service, Context, ServiceBroker } from 'moleculer';
import QueueService from 'moleculer-bull';
import CallApiMixin from '../../mixins/callApi/call-api.mixin';
import RedisMixin from '../../mixins/redis/redis.mixin';
import { RedisClientType } from '@redis/client';
import { dbTransactionMixin } from '../../mixins/dbMixinMongoose';

export default class HandleTransactionService extends Service {
	private redisMixin = new RedisMixin().start();
	private dbTransactionMixin = dbTransactionMixin;
	private redisClient;
	private consumer = Date.now().toString();

	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: 'handletransaction',
			version: 1,
			mixins: [
				QueueService(
					`redis://${Config.REDIS_USERNAME}:${Config.REDIS_PASSWORD}@${Config.REDIS_HOST}:${Config.REDIS_PORT}`,
					{
						prefix: 'handle.transaction',
						limiter: {
							max: 10,
							duration: 1000,
							// bounceBack: true,
						},
					},
				),
				this.redisMixin,
				this.dbTransactionMixin,
			],
			queues: {
				'handle.transaction': {
					concurrency: 1,
					async process(job) {
						job.progress(10);
						// @ts-ignore
						await this.handleJob(job.data.param);
						job.progress(100);
						return true;
					},
				},
			},
		});
	}

	async initEnv() {
		this.logger.info('initEnv');
		try {
			await this.redisClient.xGroupCreate(
				Config.REDIS_STREAM_TRANSACTION_NAME,
				Config.REDIS_STREAM_TRANSACTION_GROUP,
				'0-0',
				{ MKSTREAM: true },
			);
			await this.redisClient.xGroupCreateConsumer(
				Config.REDIS_STREAM_TRANSACTION_NAME,
				Config.REDIS_STREAM_TRANSACTION_GROUP,
				this.consumer,
			);
		} catch (error) {
			this.logger.error(error);
		}
	}
	async handleJob(param) {
		let hasRemainingMessage = true;
		let lastId = '0-0';

		let xAutoClaimResult = await this.redisClient.xAutoClaim(
			Config.REDIS_STREAM_TRANSACTION_NAME,
			Config.REDIS_STREAM_TRANSACTION_GROUP,
			this.consumer,
			1000,
			'0-0',
		);
		if (xAutoClaimResult.messages.length == 0) {
			hasRemainingMessage = false;
		}

		let idXReadGroup = '';
		if (hasRemainingMessage) {
			idXReadGroup = lastId;
		} else {
			idXReadGroup = '>';
		}
		const result = await this.redisClient.xReadGroup(
			Config.REDIS_STREAM_TRANSACTION_GROUP,
			this.consumer,
			[{ key: Config.REDIS_STREAM_TRANSACTION_NAME, id: idXReadGroup }],
		);
		let listMessageNeedAck: String[] = [];
		if (result)
			result.forEach((element) => {
				element.messages.forEach(async (item) => {
					this.logger.info(`Handling message ${item.id}`);
					await this.handleTransaction(JSON.parse(item.message.element));
					this.redisClient.xAck(
						Config.REDIS_STREAM_TRANSACTION_NAME,
						Config.REDIS_STREAM_TRANSACTION_GROUP,
						item.id,
					);
					listMessageNeedAck.push(item.id);
					lastId = item.id;
				});
			});
	}
	async handleTransaction(transaction) {
		let id = await this.adapter.insert(transaction);
		return id;
	}
	async _start() {
		this.redisClient = await this.getRedisClient();
		this.createJob(
			'handle.transaction',
			{
				param: `param`,
			},
			{
				removeOnComplete: false,
				repeat: {
					limit: 50,
					count: 0,
					every: 1000,
				},
			},
		);

		await this.initEnv();

		// this.getQueue('handle.transaction').on('global:progress', (jobID, progress) => {
		// 	this.logger.info(`Job #${jobID} progress is ${progress}%`);
		// });

		// this.getQueue('handle.transaction').on('global:completed', (job, res) => {
		// 	this.logger.info(`Job #${job} completed!. Result:`, res);
		// });
		return super._start();
	}
}
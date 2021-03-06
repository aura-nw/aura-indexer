import CallApiMixin from '../../mixins/callApi/call-api.mixin';
import { dbAccountUnbondsMixin } from '../../mixins/dbMixinMongoose';
import { Job } from 'bull';
import { Config } from '../../common';
import { CONST_CHAR, LIST_NETWORK, MSG_TYPE, URL_TYPE_CONSTANTS } from '../../common/constant';
import { JsonConvert } from 'json2typescript';
import { Context, Service, ServiceBroker } from 'moleculer';
import { AccountUnbondsEntity, UnbondingResponse } from '../../entities';
import { Utils } from '../../utils/utils';
import { CrawlAccountInfoParams } from '../../types';
const QueueService = require('moleculer-bull');

export default class CrawlAccountUnbondsService extends Service {
	private callApiMixin = new CallApiMixin().start();
	private dbAccountUnbondsMixin = dbAccountUnbondsMixin;

	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: 'crawlAccountUnbonds',
			version: 1,
			mixins: [
				QueueService(
					`redis://${Config.REDIS_USERNAME}:${Config.REDIS_PASSWORD}@${Config.REDIS_HOST}:${Config.REDIS_PORT}/${Config.REDIS_DB_NUMBER}`,
					{
						prefix: 'crawl.account-unbonds',
					},
				),
				// this.redisMixin,
				this.dbAccountUnbondsMixin,
				this.callApiMixin,
			],
			queues: {
				'crawl.account-unbonds': {
					concurrency: parseInt(Config.CONCURRENCY_ACCOUNT_UNBONDS, 10),
					process(job: Job) {
						job.progress(10);
						// @ts-ignore
						this.handleJob(job.data.listAddresses, job.data.chainId);
						job.progress(100);
						return true;
					},
				},
			},
			events: {
				'account-info.upsert-each': {
					handler: (ctx: Context<CrawlAccountInfoParams>) => {
						this.logger.debug(`Crawl account unbonds`);
						this.createJob(
							'crawl.account-unbonds',
							{
								listAddresses: ctx.params.listAddresses,
								chainId: ctx.params.chainId,
							},
							{
								removeOnComplete: true,
							},
						);
						return;
					},
				},
			},
		});
	}

	async handleJob(listAddresses: string[], chainId: string) {
		let listAccounts: AccountUnbondsEntity[] = [],
			listUpdateQueries: any[] = [];
		if (listAddresses.length > 0) {
			for (const address of listAddresses) {
				let listUnbonds: UnbondingResponse[] = [];

				const param =
					Config.GET_PARAMS_DELEGATOR +
					`/${address}/unbonding_delegations?pagination.limit=100`;
				const url = Utils.getUrlByChainIdAndType(chainId, URL_TYPE_CONSTANTS.LCD);

				let accountInfo: AccountUnbondsEntity = await this.adapter.findOne({
					address,
					'custom_info.chain_id': chainId,
				});
				if (!accountInfo) {
					accountInfo = {} as AccountUnbondsEntity;
					accountInfo.address = address;
				}

				let urlToCall = param;
				let done = false;
				let resultCallApi;
				while (!done) {
					resultCallApi = await this.callApiFromDomain(url, urlToCall);

					listUnbonds.push(...resultCallApi.unbonding_responses);
					if (resultCallApi.pagination.next_key === null) {
						done = true;
					} else {
						urlToCall = `${param}&pagination.key=${encodeURIComponent(
							resultCallApi.pagination.next_key,
						)}`;
					}
				}

				if (listUnbonds) {
					accountInfo.unbonding_responses = listUnbonds;
					listUnbonds.map((unbond: UnbondingResponse) => {
						let expireTime = new Date(unbond.entries[0].completion_time.toString());
						let delay = expireTime.getTime() - new Date().getTime();
						this.createJob(
							'crawl.account-unbonds',
							{
								listAddresses: [address],
								chainId,
							},
							{
								removeOnComplete: true,
								delay,
							},
						);
					});
				}

				listAccounts.push(accountInfo);
			}
		}
		try {
			listAccounts.forEach((element) => {
				if (element._id)
					listUpdateQueries.push(this.adapter.updateById(element._id, element));
				else {
					const chain = LIST_NETWORK.find((x) => x.chainId === chainId);
					const item: AccountUnbondsEntity = new JsonConvert().deserializeObject(
						element,
						AccountUnbondsEntity,
					);
					item.custom_info = {
						chain_id: chainId,
						chain_name: chain ? chain.chainName : '',
					};
					listUpdateQueries.push(this.adapter.insert(item));
				}
			});
			await Promise.all(listUpdateQueries);
		} catch (error) {
			this.logger.error(error);
		}
	}

	async _start() {
		this.getQueue('crawl.account-unbonds').on('completed', (job: Job) => {
			this.logger.info(`Job #${job.id} completed!. Result:`, job.returnvalue);
		});
		this.getQueue('crawl.account-unbonds').on('failed', (job: Job) => {
			this.logger.error(`Job #${job.id} failed!. Result:`, job.stacktrace);
		});
		this.getQueue('crawl.account-unbonds').on('progress', (job: Job) => {
			this.logger.info(`Job #${job.id} progress is ${job.progress()}%`);
		});
		return super._start();
	}
}

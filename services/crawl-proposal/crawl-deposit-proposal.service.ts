/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
'use strict';
import CallApiMixin from '../../mixins/callApi/call-api.mixin';
import { Service, Context, ServiceBroker } from 'moleculer';
const QueueService = require('moleculer-bull');
import { dbProposalMixin } from '../../mixins/dbMixinMongoose';
import { Config } from '../../common';
import { MSG_TYPE, URL_TYPE_CONSTANTS } from '../../common/constant';
import { Job } from 'bull';
import { Utils } from '../../utils/utils';
import { IDepositProposalResponseFromLCD, ListTxCreatedParams } from 'types';
import { IDeposit, IProposal, ITransaction } from 'entities';

export default class CrawlProposalService extends Service {
	private callApiMixin = new CallApiMixin().start();
	private dbProposalMixin = dbProposalMixin;

	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: 'crawlDepositProposal',
			version: 1,
			mixins: [
				QueueService(
					`redis://${Config.REDIS_USERNAME}:${Config.REDIS_PASSWORD}@${Config.REDIS_HOST}:${Config.REDIS_PORT}/${Config.REDIS_DB_NUMBER}`,
					{
						prefix: 'crawl.deposit.proposal',
					},
				),
				// QueueService(
				// 	`redis://${Config.REDIS_USERNAME}:${Config.REDIS_PASSWORD}@${Config.REDIS_HOST}:${Config.REDIS_PORT}/${Config.REDIS_DB_NUMBER}`,
				// 	{
				// 		prefix: 'crawl.deposit.tx',
				// 	},
				// ),
				this.callApiMixin,
				this.dbProposalMixin,
			],
			queues: {
				'crawl.deposit.proposal': {
					concurrency: 1,
					async process(job: Job) {
						job.progress(10);
						// @ts-ignore
						await this.handleJobDeposit(job.data.id);
						job.progress(100);
						return true;
					},
				},
				// 'crawl.deposit.tx': {
				// 	concurrency: 1,
				// 	async process(job: Job) {
				// 		job.progress(10);
				// 		// @ts-ignore
				// 		await this.handleJobDepositTx(job.data.listTx);
				// 		job.progress(100);
				// 		return true;
				// 	},
				// },
			},
			events: {
				'proposal.depositing': {
					handler: (ctx: any) => {
						this.logger.debug(`Crawl deposit by proposal: ${ctx.params.id}`);

						this.createJob(
							'crawl.deposit.proposal',
							{
								id: ctx.params.id,
							},
							{
								removeOnComplete: true,
							},
						);
						return;
					},
				},
				// 'list-tx.upsert': {
				// 	handler: (ctx: Context<ListTxCreatedParams, Record<string, unknown>>) => {
				// 		this.logger.debug(`Crawl deposit by tx`);
				// 		this.createJob(
				// 			'crawl.deposit.tx',
				// 			{
				// 				listTx: ctx.params.listTx,
				// 			},
				// 			{
				// 				removeOnComplete: true,
				// 			},
				// 		);
				// 		return;
				// 	},
				// },
			},
		});
	}

	// async handleJobDepositTx(listTx: ITransaction[]) {
	// 	listTx.map(async (tx: ITransaction) => {
	// 		if (tx.tx_response.code == '0') {
	// 			let listMessage = tx.tx.body.messages;
	// 			listMessage.map(async (message: any) => {
	// 				if (message['@type'] == MSG_TYPE.MSG_DEPOSIT) {
	// 					let depositTx = {
	// 						depositor: message.depositor,
	// 						amount: message.amount,
	// 						txhash: tx.tx_response.txhash,
	// 					};
	// 					let foundProposal: IProposal = await this.adapter.findOne({
	// 						proposal_id: Number(message.proposal_id),
	// 						'custom_info.chain_id': Config.CHAIN_ID,
	// 					});
	// 					if (foundProposal) {
	// 						foundProposal.list_tx_deposit.push(depositTx);
	// 						await this.adapter.updateById(foundProposal._id, foundProposal);
	// 					}
	// 				}
	// 			});
	// 		}
	// 	});
	// }

	async handleJobDeposit(proposalId: String) {
		let path = `${Config.GET_ALL_PROPOSAL}/${proposalId}/deposits`;
		const url = Utils.getUrlByChainIdAndType(Config.CHAIN_ID, URL_TYPE_CONSTANTS.LCD);

		let done = false;
		let resultCallApi: IDepositProposalResponseFromLCD;
		let listDeposit: IDeposit[] = [];
		while (!done) {
			resultCallApi = await this.callApiFromDomain(url, path);

			listDeposit.push(...resultCallApi.deposits);
			if (resultCallApi.pagination.next_key === null) {
				done = true;
			} else {
				path = `${path}&pagination.key=${encodeURIComponent(
					resultCallApi.pagination.next_key.toString(),
				)}`;
			}
		}
		if (listDeposit.length == 0) {
			return;
		}
		this.logger.debug(listDeposit);
		let deposit = listDeposit.map((item: any) => ({
			depositor: item.depositor,
			amount: item.amount,
		}));

		let foundProposal = await this.adapter.findOne({
			proposal_id: `${proposalId}`,
			'custom_info.chain_id': Config.CHAIN_ID,
		});
		if (foundProposal) {
			try {
				let res = await this.adapter.updateById(foundProposal._id, {
					$set: { deposit: deposit },
				});
				this.logger.debug(res);
			} catch (error) {
				this.logger.error(error);
			}
		}
	}
	async _start() {
		this.getQueue('crawl.deposit.proposal').on('completed', (job: Job) => {
			this.logger.info(`Job #${job.id} completed!. Result:`, job.returnvalue);
		});
		this.getQueue('crawl.deposit.proposal').on('failed', (job: Job) => {
			this.logger.error(`Job #${job.id} failed!. Result:`, job.stacktrace);
		});
		this.getQueue('crawl.deposit.proposal').on('progress', (job: Job) => {
			this.logger.info(`Job #${job.id} progress is ${job.progress()}%`);
		});
		return super._start();
	}
}

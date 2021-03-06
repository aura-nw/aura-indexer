/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
'use strict';
import { Context } from 'moleculer';
import { Put, Method, Service, Get, Action } from '@ourparentcenter/moleculer-decorators-extended';
import { dbTransactionMixin } from '../../mixins/dbMixinMongoose';
import {
	ErrorCode,
	ErrorMessage,
	GetTxRequest,
	ISearchTxQuery,
	MoleculerDBService,
	ResponseDto,
} from '../../types';
import { ITransaction, TransactionEntity } from '../../entities';
import { QueryOptions } from 'moleculer-db';
import { ObjectId } from 'mongodb';
import { BASE_64_ENCODE, LIST_NETWORK, SEARCH_TX_QUERY } from '../../common/constant';
import { fromBase64, toBase64, fromBech32, toBech32, fromUtf8, toUtf8 } from '@cosmjs/encoding';
import { Utils } from '../../utils/utils';
/**
 * @typedef {import('moleculer').Context} Context Moleculer's Context
 */
@Service({
	name: 'transaction',
	version: 1,
	mixins: [dbTransactionMixin],
})
export default class BlockService extends MoleculerDBService<
	{
		rest: 'v1/transaction';
	},
	ITransaction
> {
	/**
	 *  @swagger
	 *  /v1/transaction:
	 *    get:
	 *      tags:
	 *        - Transaction
	 *      summary: Get latest transaction
	 *      description: Get latest transaction
	 *      produces:
	 *        - application/json
	 *      consumes:
	 *        - application/json
	 *      parameters:
	 *        - in: query
	 *          name: chainid
	 *          required: true
	 *          type: string
	 *          enum: ["aura-testnet","serenity-testnet-001","halo-testnet-001","theta-testnet-001","osmo-test-4","evmos_9000-4","euphoria-1","cosmoshub-4"]
	 *          description: "Chain Id of network need to query"
	 *        - in: query
	 *          name: blockHeight
	 *          required: false
	 *          type: string
	 *          description: "Block height of transaction"
	 *        - in: query
	 *          name: txHash
	 *          required: false
	 *          type: string
	 *          description: "Transaction hash"
	 *        - in: query
	 *          name: address
	 *          required: false
	 *          type: string
	 *          description: "Address in transaction"
	 *        - in: query
	 *          name: searchType
	 *          required: false
	 *          type: string
	 *          enum: ["transfer","proposal_deposit", "proposal_vote", "delegate", "redelegate", "instantiate", "execute", "wasm"]
	 *          description: "Search type event"
	 *        - in: query
	 *          name: searchKey
	 *          required: false
	 *          type: string
	 *          enum: ["sender","recipient","proposal_id", "validator", "destination_validator", "_contract_address"]
	 *          description: "Search key event"
	 *        - in: query
	 *          name: searchValue
	 *          required: false
	 *          type: string
	 *          description: "Search value event"
	 *        - in: query
	 *          name: query
	 *          required: false
	 *          type: string
	 *          description: "Search query with format A.B=C,D.E=F"
	 *        - in: query
	 *          name: pageOffset
	 *          required: false
	 *          default: 0
	 *          type: number
	 *          description: "Page number, start at 0"
	 *        - in: query
	 *          name: pageLimit
	 *          required: false
	 *          default: 10
	 *          type: number
	 *          description: "number record return in a page"
	 *        - in: query
	 *          name: countTotal
	 *          required: false
	 *          default: false
	 *          type: boolean
	 *          description: "count total record"
	 *        - in: query
	 *          name: nextKey
	 *          required: false
	 *          default:
	 *          type: string
	 *          description: "key for next page"
	 *        - in: query
	 *          name: reverse
	 *          required: false
	 *          enum: ["true","false"]
	 *          default: false
	 *          type: string
	 *          description: "reverse is true if you want to get the oldest record first, default is false"
	 *      responses:
	 *        '200':
	 *          description: Register result
	 *        '422':
	 *          description: Missing parameters
	 *
	 */
	@Get('/', {
		name: 'getByChain',
		params: {
			chainid: {
				type: 'string',
				optional: false,
				enum: LIST_NETWORK.map((e) => {
					return e.chainId;
				}),
			},
			blockHeight: { type: 'number', optional: true, convert: true },
			txHash: { type: 'string', optional: true },
			address: { type: 'string', optional: true },
			pageLimit: {
				type: 'number',
				optional: true,
				default: 10,
				integer: true,
				convert: true,
				min: 1,
				max: 100,
			},
			searchType: {
				type: 'string',
				optional: true,
				default: null,
				enum: Object.values(SEARCH_TX_QUERY).map((e: ISearchTxQuery) => {
					return e.type;
				}),
			},
			searchKey: {
				type: 'string',
				optional: true,
				default: null,
				enum: Object.values(SEARCH_TX_QUERY).map((e: ISearchTxQuery) => {
					return e.key;
				}),
			},
			searchValue: {
				type: 'string',
				optional: true,
				default: null,
			},
			query: {
				type: 'string',
				optional: true,
				default: null,
			},
			pageOffset: {
				type: 'number',
				optional: true,
				default: 0,
				integer: true,
				convert: true,
				min: 0,
				max: 100,
			},
			countTotal: {
				type: 'boolean',
				optional: true,
				default: false,
				convert: true,
			},
			nextKey: {
				type: 'string',
				optional: true,
				default: null,
			},
			reverse: {
				type: 'boolean',
				optional: true,
				default: false,
				convert: true,
			},
		},
		cache: {
			ttl: 10,
		},
	})
	async getByChain(ctx: Context<GetTxRequest, Record<string, unknown>>) {
		let response: ResponseDto = {} as ResponseDto;
		if (ctx.params.nextKey) {
			try {
				new ObjectId(ctx.params.nextKey);
			} catch (error) {
				return (response = {
					code: ErrorCode.WRONG,
					message: ErrorMessage.VALIDATION_ERROR,
					data: {
						message: 'The nextKey is not a valid ObjectId',
					},
				});
			}
		}

		const blockHeight = ctx.params.blockHeight;
		const txHash = ctx.params.txHash;
		const address = ctx.params.address;
		const searchType = ctx.params.searchType;
		const searchKey = ctx.params.searchKey;
		const searchValue = ctx.params.searchValue;
		const queryParam = ctx.params.query;

		//TODO: fix slow when count in query
		// const countTotal = ctx.params.countTotal;
		ctx.params.countTotal = false;
		const sort = ctx.params.reverse ? '_id' : '-_id';
		let query: QueryOptions = {
			'custom_info.chain_id': ctx.params.chainid,
		};

		if (blockHeight) {
			query['tx_response.height'] = blockHeight;
		}
		if (txHash) {
			query['tx_response.txhash'] = txHash;
		}

		if (address) {
			query['$and'] = [
				{
					'tx_response.events.attributes.value': toBase64(toUtf8(address)),
				},
				{
					$or: [
						{ 'tx_response.events.attributes.key': BASE_64_ENCODE.RECIPIENT },
						{ 'tx_response.events.attributes.key': BASE_64_ENCODE.SENDER },
					],
				},
			];
			// query['tx_response.events.type'] = 'transfer';
			// query['$or'] = [
			// 	{ 'tx_response.events.attributes.key': BASE_64_ENCODE.RECIPIENT },
			// 	{ 'tx_response.events.attributes.key': BASE_64_ENCODE.SENDER },
			// ];
			// query['tx_response.events.attributes.value'] = toBase64(toUtf8(address));
		}

		if (searchType) {
			query['tx_response.events.type'] = searchType;
		}
		if (searchKey && searchValue) {
			query['tx_response.events.attributes.key'] = toBase64(toUtf8(searchKey));
			query['tx_response.events.attributes.value'] = toBase64(toUtf8(searchValue));
		}

		if (queryParam) {
			let queryParamFormat = Utils.formatSearchQueryInTxSearch(ctx.params.query);
			// this.logger.info('queryParam: ', JSON.stringify(queryParamFormat));
			let queryAnd: any[] = [];
			queryParamFormat.forEach((e: any) => {
				let tempQuery = {
					'tx_response.events.type': e.type,
					'tx_response.events.attributes.key': toBase64(toUtf8(e.key)),
					'tx_response.events.attributes.value': toBase64(toUtf8(e.value)),
				};
				queryAnd.push(tempQuery);
			});
			query['$and'] = queryAnd;
		}

		if (ctx.params.txHash) {
			ctx.params.nextKey = undefined;
			ctx.params.countTotal = false;
			ctx.params.pageOffset = 0;
		}
		if (ctx.params.nextKey) {
			query._id = { $lt: new ObjectId(ctx.params.nextKey) };
			ctx.params.pageOffset = 0;
			ctx.params.countTotal = false;
		}
		this.logger.info('query: ', JSON.stringify(query));
		try {
			// @ts-ignore
			let [result, count] = await Promise.all<TransactionEntity, TransactionEntity>([
				this.adapter.find({
					query: query,
					limit: ctx.params.pageLimit,
					offset: ctx.params.pageOffset,
					// @ts-ignore
					sort: sort,
				}),
				//@ts-ignore
				ctx.params.countTotal === true
					? this.adapter.count({
							query: query,
					  })
					: 0,
			]);
			response = {
				code: ErrorCode.SUCCESSFUL,
				message: ErrorMessage.SUCCESSFUL,
				data: {
					transactions: result,
					count: count,
					nextKey: ctx.params.txHash ? null : result[result.length - 1]?._id,
				},
			};
		} catch (error) {
			response = {
				code: ErrorCode.WRONG,
				message: ErrorMessage.WRONG,
				data: {
					error,
				},
			};
		}

		return response;
	}
}

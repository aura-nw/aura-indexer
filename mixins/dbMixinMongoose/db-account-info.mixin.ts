'use strict';

import CallApiMixin from "@Mixins/callApi/call-api.mixin";
import { transactionMongoModel } from '../../model';
import { Config } from "../../common";
import { DbBaseMixin } from "./db-base.mixin";

const dbInfo = Config.DB_ACCOUNT_INFO;

const dbBaseMixin = new DbBaseMixin({
    dbInfo,
    name: 'dbAccountInfoMixin',
    collection: dbInfo.collection,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	model: transactionMongoModel(dbInfo.collection),
});

export const dbAccountInfoMixin = dbBaseMixin.getMixin();
export const callApiMixin = new CallApiMixin().start();
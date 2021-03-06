import { Config } from '../common';
import { JsonObject, JsonProperty } from 'json2typescript';
import { Coin, ICoin } from './coin.entity';
import { Types } from 'mongoose';
import { ObjectIdNull } from 'types';

export interface ICommunityPool {
	_id: ObjectIdNull;
	pool: ICoin[];
}
@JsonObject('CommunityPool')
export class CommunityPoolEntity {
	@JsonProperty('_id', String, true)
	_id = Config.DB_PARAM.dialect === 'local' ? Types.ObjectId() : null;
	@JsonProperty('pool', [Coin])
	pool: Coin[] = [];
}

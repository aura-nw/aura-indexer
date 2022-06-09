import { Config } from '../common';
import { JsonObject, JsonProperty } from 'json2typescript';
import { Types } from 'mongoose';
import { Coin } from './coin.entity';

@JsonObject('MsgBank')
export class MsgBank {
	@JsonProperty('from_address', String, true)
	from_address: String = '';
	@JsonProperty('to_address', String, true)
	to_address: String = '';
	@JsonProperty('amount', [Coin], true)
	amount: Coin[] = [];
}
@JsonObject('MsgCreateVestingAccount')
export class MsgCreateVestingAccount {
	@JsonProperty('from_address', String, true)
	from_address: String = '';
	@JsonProperty('to_address', String, true)
	to_address: String = '';
	@JsonProperty('amount', [Coin], true)
	amount: Coin[] = [];
	@JsonProperty('end_time', String, true)
	end_time: String = '';
	@JsonProperty('delayed', String, true)
	delayed: String = '';
}
@JsonObject('Grant')
export class Grant {
	@JsonProperty('authorization', String, true)
	authorization: String = '';
	@JsonProperty('expiration', String, true)
	expiration: String = '';
}
@JsonObject('MsgGrant')
export class MsgGrant {
	@JsonProperty('granter', String, true)
	granter: String = '';
	@JsonProperty('grantee', [Coin], true)
	grantee: Coin[] = [];
	@JsonProperty('grant', Grant, true)
	grant: Grant = new Grant();
}
@JsonObject('Body')
export class Body {
	@JsonProperty('memo', String, true)
	memo: String = '';
	@JsonProperty('timeout_height', String, true)
	timeout_height: String = '';
	@JsonProperty('extension_options', [String], true)
	extension_options: String[] = [];
	@JsonProperty('non_critical_extension_options', [String], true)
	non_critical_extension_options: String[] = [];
}

@JsonObject('AuthInfo')
export class AuthInfo {
	@JsonProperty('signed_infos', [String], true)
	signed_infos: String[] = [];
	@JsonProperty('amount', [Coin], true)
	amount: Coin[] = [];
	@JsonProperty('gas_limit', String, true)
	gas_limit: string = '';
	@JsonProperty('payer', String, true)
	payer: string = '';
	@JsonProperty('granter', String, true)
	granter: string = '';
}

@JsonObject('Proposal')
export class ProposalEntity {
	@JsonProperty('_id', String, true)
	public _id = Config.DB_TRANSACTION.dialect === 'local' ? Types.ObjectId() : null;

	@JsonProperty('body', Body, true)
	body: Body = {} as Body;

	@JsonProperty('auth_info', AuthInfo, true)
	auth_info: AuthInfo = {} as AuthInfo;

	@JsonProperty('signatures', [String], true)
	signatures: string[] = [];

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
	public getMongoEntity() {
		// eslint-disable-next-line no-underscore-dangle
		return { ...this, _id: this._id && (this._id as Types.ObjectId).toString() };
	}
}
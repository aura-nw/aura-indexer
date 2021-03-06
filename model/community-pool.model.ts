import { ICommunityPool } from '../entities';
import { model, models, Schema, Types } from 'mongoose';
import { definitionType, ObjectIdNull } from '../types';
import { customInfoModel } from './custom-info.model';

const definition: definitionType<ICommunityPool> = (collection?: string) => ({
	_id: Types.ObjectId,
	pool: [
		{
			denom: String,
			amount: String,
		},
	],
	custom_info: customInfoModel,
});

export const communityPoolMongoModel = (collection: string): unknown => {
	// eslint-disable-next-line @typescript-eslint/ban-ts-comment
	// @ts-ignore
	const schema = new Schema(definition(collection), {
		autoIndex: true,
		collection: collection,
	});
	return models[collection] || model(collection, schema);
};

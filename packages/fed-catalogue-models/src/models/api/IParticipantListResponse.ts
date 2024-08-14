// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import type { IParticipantEntry } from "../IParticipantEntry";

/**
 * Response for log entry list request.
 */
export interface IParticipantListResponse {
	/**
	 * The response payload.
	 */
	body: {
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: IParticipantEntry[];

		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;

		/**
		 * Number of entities to return.
		 */
		pageSize?: number;

		/**
		 * Total entities length.
		 */
		totalEntities: number;
	};
}
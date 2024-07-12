// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.
import { BaseError, Guards, Is, Urn, type IError } from "@gtsc/core";
import type { EntityCondition, SortDirection } from "@gtsc/entity";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@gtsc/entity-storage-models";
import type { ILogEntry, ILoggingConnector, LogLevel } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import type { IServiceRequestContext } from "@gtsc/services";
import type { LogEntry } from "./entities/logEntry";
import type { IEntityStorageLoggingConnectorConfig } from "./models/IEntityStorageLoggingConnectorConfig";

/**
 * Class for performing logging operations in entity storage.
 */
export class EntityStorageLoggingConnector implements ILoggingConnector {
	/**
	 * The namespace for the entities.
	 * @internal
	 */
	private static readonly _NAMESPACE: string = "entity-logging";

	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<EntityStorageLoggingConnector>();

	/**
	 * The log levels to capture, will default to all.
	 */
	private readonly _levels: LogLevel[];

	/**
	 * The entity storage for the log entries.
	 * @internal
	 */
	private readonly _logEntryStorage: IEntityStorageConnector<LogEntry>;

	/**
	 * Create a new instance of EntityStorageLoggingConnector.
	 * @param options The options for the connector.
	 * @param options.logEntryStorageConnectorType The type of the entity storage connector to use, defaults to "log-entry".
	 * @param options.config The configuration for the logging connector.
	 */
	constructor(options?: {
		logEntryStorageConnectorType?: string;
		config?: IEntityStorageLoggingConnectorConfig;
	}) {
		this._levels = options?.config?.levels ?? ["debug", "info", "warn", "error", "trace"];
		this._logEntryStorage = EntityStorageConnectorFactory.get(
			options?.logEntryStorageConnectorType ?? "log-entry"
		);
	}

	/**
	 * Log an entry to the connector.
	 * @param logEntry The entry to log.
	 * @param requestContext The context for the request.
	 * @returns Nothing.
	 */
	public async log(logEntry: ILogEntry, requestContext?: IServiceRequestContext): Promise<void> {
		Guards.object<ILogEntry>(this.CLASS_NAME, nameof(logEntry), logEntry);

		if (this._levels.includes(logEntry.level)) {
			const idUrn = Urn.generateRandom(EntityStorageLoggingConnector._NAMESPACE);

			let errorsJson;
			if (Is.notEmpty(logEntry.error)) {
				const flattened = BaseError.flatten(logEntry.error);
				errorsJson = JSON.stringify(flattened);
			}

			let dataJson;
			if (Is.notEmpty(logEntry.data)) {
				dataJson = JSON.stringify(logEntry.data);
			}

			const entity: LogEntry = {
				id: idUrn.namespaceSpecific(),
				level: logEntry.level,
				source: logEntry.source,
				ts: logEntry.ts ?? Date.now(),
				message: logEntry.message,
				error: errorsJson,
				data: dataJson
			};

			await this._logEntryStorage.set(entity, requestContext);
		}
	}

	/**
	 * Query the log entries.
	 * @param conditions The conditions to match for the entities.
	 * @param sortProperties The optional sort order.
	 * @param properties The optional keys to return, defaults to all.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @param requestContext The context for the request.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async query(
		conditions?: EntityCondition<ILogEntry>,
		sortProperties?: {
			property: keyof ILogEntry;
			sortDirection: SortDirection;
		}[],
		properties?: (keyof ILogEntry)[],
		cursor?: string,
		pageSize?: number,
		requestContext?: IServiceRequestContext
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: Partial<ILogEntry>[];
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
	}> {
		const result = await this._logEntryStorage.query(
			conditions as EntityCondition<LogEntry>,
			sortProperties,
			properties,
			cursor,
			pageSize,
			requestContext
		);

		const mappedEntities: Partial<ILogEntry>[] = [];

		for (const entity of result.entities) {
			const errors: IError[] = Is.stringValue(entity.error) ? JSON.parse(entity.error) : undefined;

			mappedEntities.push({
				level: entity.level,
				source: entity.source,
				ts: entity.ts,
				message: entity.message,
				error: BaseError.expand(errors),
				data: Is.stringValue(entity.data) ? JSON.parse(entity.data) : undefined
			});
		}

		return {
			entities: mappedEntities,
			cursor: result.cursor,
			pageSize: result.pageSize,
			totalEntities: result.totalEntities
		};
	}
}

// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

import { Guards, UnprocessableError } from "@gtsc/core";
import {
	EntityStorageConnectorFactory,
	type IEntityStorageConnector
} from "@gtsc/entity-storage-models";
import type {
	IComplianceCredential,
	IFederatedCatalogue,
	IParticipantEntry,
	IServiceDescriptionCredential,
	IServiceDescriptionEntry,
	IVerifiableCredential,
	ParticipantEntry,
	ServiceDescriptionEntry
} from "@gtsc/fed-catalogue-models";
import { LoggingConnectorFactory, type ILoggingConnector } from "@gtsc/logging-models";
import { nameof } from "@gtsc/nameof";
import { ComplianceCredentialVerificationService } from "./verification/complianceCredentialVerificationService";
import { JwtVerificationService } from "./verification/jwtVerificationService";
import { ServiceDescriptionCredentialVerificationService } from "./verification/serviceDescriptionCredentialVerificationService";

/**
 * Service for performing logging operations to a connector.
 */
export class FederatedCatalogueService implements IFederatedCatalogue {
	/**
	 * Runtime name for the class.
	 */
	public readonly CLASS_NAME: string = nameof<FederatedCatalogueService>();

	/**
	 * Logging service.
	 */
	private readonly _loggingService: ILoggingConnector;

	/**
	 * Storage service for participants.
	 */
	private readonly _entityStorageParticipants: IEntityStorageConnector<ParticipantEntry>;

	/**
	 * Storage service for service descriptions.
	 */
	private readonly _entityStorageSDs: IEntityStorageConnector<ServiceDescriptionEntry>;

	/**
	 * JWT Verifier service.
	 * @internal
	 */
	private readonly _jwtVerifier: JwtVerificationService;

	/**
	 * Compliance Credential Verifier service.
	 * @internal
	 */
	private readonly _complianceCredentialVerifier: ComplianceCredentialVerificationService;

	/**
	 * SD Credential Verifier service.
	 * @internal
	 */
	private readonly _serviceDescriptionCredentialVerifier: ServiceDescriptionCredentialVerificationService;

	/**
	 * Create a new instance of FederatedCatalogue service.
	 * @param options The options for the connector.
	 * @param options.loggingConnectorType The type of the logging connector to use, defaults to "logging".
	 * @param options.entityStorageConnectorName The name of the Entity Connector, defaults to "participant-entry".
	 */
	constructor(options?: { loggingConnectorType?: string; entityStorageConnectorName?: string }) {
		this._loggingService = LoggingConnectorFactory.get(options?.loggingConnectorType ?? "logging");
		this._entityStorageParticipants = EntityStorageConnectorFactory.get<
			IEntityStorageConnector<ParticipantEntry>
		>(options?.entityStorageConnectorName ?? "participant-entry");

		this._entityStorageSDs = EntityStorageConnectorFactory.get<
			IEntityStorageConnector<ServiceDescriptionEntry>
		>("service-description-entry");

		this._jwtVerifier = new JwtVerificationService(this._loggingService);
		this._complianceCredentialVerifier = new ComplianceCredentialVerificationService(
			this._loggingService
		);
		this._serviceDescriptionCredentialVerifier =
			new ServiceDescriptionCredentialVerificationService(this._loggingService);
	}

	/**
	 * Registers a compliance Credential to the service.
	 * @param credentialJwt The credential (wrapped into a presentation) as JWT.
	 * @returns Nothing.
	 */
	public async registerComplianceCredential(credentialJwt: string): Promise<void> {
		Guards.string(this.CLASS_NAME, nameof(credentialJwt), credentialJwt);

		// This will raise exceptions as it has been coded reusing code from Gaia-X
		const complianceCredential = (await this._jwtVerifier.decodeJwt(
			credentialJwt
		)) as IComplianceCredential;

		const result = await this._complianceCredentialVerifier.verify(complianceCredential);

		if (!result.verified) {
			this._loggingService.log({
				level: "error",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "Compliance credential cannot be verified",
				data: { result }
			});

			throw new UnprocessableError(this.CLASS_NAME, "Compliance credential cannot be verified", {
				reason: result.verificationFailureReason
			});
		}

		const participantEntry = this.extractParticipantEntry(
			// Workaround to deal with GX Compliance Service
			complianceCredential.credentialSubject.id.split("#")[0],
			complianceCredential,
			result.credentials
		);

		await this._entityStorageParticipants.set(participantEntry);

		await this._loggingService.log({
			level: "info",
			source: this.CLASS_NAME,
			ts: Date.now(),
			message: "Compliance credential verified and new entry added to the Fed Catalogue",
			data: {
				participantId: complianceCredential.credentialSubject.id,
				trustedIssuer: complianceCredential.issuer
			}
		});
	}

	/**
	 * Query the federated catalogue.
	 * @param participantId The identity of the participant.
	 * @param legalRegistrationNumber The legal registration number.
	 * @param lrnType The legal registration number type (EORI, VATID, GLEIF, KENYA_PIN, etc.)
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async queryParticipants(
		participantId?: string,
		legalRegistrationNumber?: string,
		lrnType?: string,
		cursor?: string,
		pageSize?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: IParticipantEntry[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	}> {
		const entries = await this._entityStorageParticipants.query();
		return {
			entities: entries.entities as IParticipantEntry[],
			cursor: entries.cursor
		};
	}

	/**
	 * Registers a compliance Credential to the service.
	 * @param credentialJwt The credential (wrapped into a presentation) as JWT.
	 * @returns Nothing.
	 */
	public async registerServiceDescriptionCredential(credentialJwt: string): Promise<void> {
		Guards.string(this.CLASS_NAME, nameof(credentialJwt), credentialJwt);

		// This will raise exceptions as it has been coded reusing code from Gaia-X
		const sdCredential = (await this._jwtVerifier.decodeJwt(
			credentialJwt
		)) as IServiceDescriptionCredential;

		const result = await this._serviceDescriptionCredentialVerifier.verify(sdCredential);

		if (!result.verified) {
			this._loggingService.log({
				level: "error",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "Service Description credential cannot be verified",
				data: { result }
			});

			throw new UnprocessableError(
				this.CLASS_NAME,
				"Service Description credential cannot be verified",
				{
					reason: result.verificationFailureReason
				}
			);
		}

		const serviceProvider = sdCredential.credentialSubject["gx:providedBy"];
		const participantData = await this._entityStorageParticipants.get(serviceProvider);
		if (!participantData) {
			this._loggingService.log({
				level: "error",
				source: this.CLASS_NAME,
				ts: Date.now(),
				message: "Service provider is not known as participant",
				data: { providedBy: sdCredential.credentialSubject["gx:providedBy"] }
			});

			throw new UnprocessableError(
				this.CLASS_NAME,
				"Service provider is not known as participant",
				{
					providedBy: sdCredential.credentialSubject["gx:providedBy"]
				}
			);
		}

		// Check what has to be done concerning the issuer

		const serviceDescriptionEntry = this.extractServiceDescriptionEntry(sdCredential);

		await this._entityStorageSDs.set(serviceDescriptionEntry);

		await this._loggingService.log({
			level: "info",
			source: this.CLASS_NAME,
			ts: Date.now(),
			message: "Service Description credential verified and new entry added to the Fed Catalogue",
			data: {
				providedBy: sdCredential.credentialSubject["gx:providedBy"],
				trustedIssuer: sdCredential.issuer
			}
		});
	}

	/**
	 * Query the federated catalogue.
	 * @param providedBy The identity of the participant.
	 * @param cursor The cursor to request the next page of entities.
	 * @param pageSize The maximum number of entities in a page.
	 * @returns All the entities for the storage matching the conditions,
	 * and a cursor which can be used to request more entities.
	 * @throws NotImplementedError if the implementation does not support retrieval.
	 */
	public async queryServiceDescriptions(
		providedBy?: string,
		cursor?: string,
		pageSize?: number
	): Promise<{
		/**
		 * The entities, which can be partial if a limited keys list was provided.
		 */
		entities: IServiceDescriptionEntry[];
		/**
		 * An optional cursor, when defined can be used to call find to get more entities.
		 */
		cursor?: string;
	}> {
		const entries = await this._entityStorageSDs.query();
		return {
			entities: entries.entities as IServiceDescriptionEntry[],
			cursor: entries.cursor
		};
	}

	/**
	 * Extracts participant entry from the credentials.
	 * @param participantId Participant Id.
	 * @param complianceCredential Compliance credential
	 * @param credentials The Credentials extracted.
	 * @returns Participant Entry to be saved on the Database.
	 */
	private extractParticipantEntry(
		participantId: string,
		complianceCredential: IComplianceCredential,
		credentials: { [type: string]: IVerifiableCredential }
	): IParticipantEntry {
		const legalParticipantData = credentials["gx:LegalParticipant"].credentialSubject;
		const legalRegistrationData = credentials["gx:legalRegistrationNumber"].credentialSubject;
		const legalRegistrationEvidence = credentials["gx:legalRegistrationNumber"].evidence;

		const evidences: string[] = [];
		for (const evidence of complianceCredential.credentialSubject["gx:evidence"]) {
			evidences.push(evidence.id as string);
		}

		const result: IParticipantEntry = {
			participantId,
			legalRegistrationNumber: legalRegistrationData["gx:taxId"] as string,
			lrnType: legalRegistrationEvidence["gx:evidenceOf"] as string,
			countryCode: legalRegistrationData["gx:countryCode"] as string,
			trustedIssuerId: complianceCredential.issuer,
			legalName: legalParticipantData["gx:legalName"] as string,
			validFrom: complianceCredential.validFrom,
			validUntil: complianceCredential.validUntil,
			dateCreated: new Date().toISOString(),
			evidences
		};

		return result;
	}

	/**
	 * Extracts participant entry from the credentials.
	 * @param sdCredential SD credential
	 * @returns Service Description Entry to be saved on the Database.
	 */
	private extractServiceDescriptionEntry(
		sdCredential: IServiceDescriptionCredential
	): IServiceDescriptionEntry {
		const credentialData = sdCredential.credentialSubject;

		const result: IServiceDescriptionEntry = {
			serviceId: credentialData.id,
			providedBy: credentialData["gx:providedBy"],
			servicePolicy: credentialData["gx:servicePolicy"],
			name: credentialData["gx:name"],
			endpointURL: credentialData["gx:endpoint"].endpointURL,
			validFrom: sdCredential.validFrom,
			validUntil: sdCredential.validUntil,
			dateCreated: new Date().toISOString(),
			evidences: [sdCredential.id]
		};

		return result;
	}
}

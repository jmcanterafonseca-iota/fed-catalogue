// Copyright 2024 IOTA Stiftung.
// SPDX-License-Identifier: Apache-2.0.

/**
 * Interface describing a participant.
 */
export interface IParticipantEntry {
	/**
	 * The participant Id.
	 */
	id: string;

	/**
	 * JSON-LD type.
	 */
	type: "Participant";

	/**
	 * The legal registration number type.
	 */
	lrnType: string;

	/**
	 * The legal registration number.
	 */
	registrationNumber: string;

	/**
	 * The legal name.
	 */
	legalName: string;

	/**
	 * The trusted issuer of the compliance credential
	 */
	trustedIssuerId: string;

	/**
	 * Country code
	 */
	countryCode: string;

	/**
	 * Valid from
	 */
	validFrom: string;

	/**
	 * Valid to
	 */
	validUntil: string;

	/**
	 * Date created
	 */
	dateCreated: string;

	/**
	 * Original credentials
	 *
	 */
	evidences: string[];
}

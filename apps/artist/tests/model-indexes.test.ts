import { describe, expect, it } from "vitest";

import { POSContractModel } from "../../admin/models/PosContract";
import { TermsDocumentModel } from "../../admin/models/TermsDocument";

function countSingleFieldUniqueIndexes(indexes: Array<[Record<string, unknown>, { unique?: boolean }]>, field: string) {
  return indexes.filter(([definition, options]: [Record<string, unknown>, { unique?: boolean }]) => Object.keys(definition).length === 1 && definition[field] === 1 && options.unique === true).length;
}

describe("Mongoose index declarations", () => {
  it("declares each unique field index only once", () => {
    expect(countSingleFieldUniqueIndexes(TermsDocumentModel.schema.indexes(), "key")).toBe(1);
    expect(countSingleFieldUniqueIndexes(POSContractModel.schema.indexes(), "txId")).toBe(1);
  });
});

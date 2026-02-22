"use client";

import type { RefObject } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type CustomerType = "b2c" | "b2b";
type CheckoutPaymentMethod = "terminal_bridge" | "terminal_external" | "cash";
type DeliveryMethod = "pickup" | "shipping" | "forwarding";
type EditionType = "unique" | "edition";
type CheckoutStep = "receipt" | "contract" | "payment" | "processing" | "done";

type Totals = {
  grossCents: number;
  netCents: number;
  vatCents: number;
};

type CartLine = {
  itemId: string;
  title: string;
  artistName: string | null;
  priceGrossCents: number;
  qty: number;
};

type BuyerForm = {
  name: string;
  company: string;
  billingAddress: string;
  shippingAddress: string;
  shippingSameAsBilling: boolean;
  email: string;
  phone: string;
};

type PosLocation = {
  id: string;
  name: string;
  address: string;
};

type PosTerminal = {
  id: string;
  locationId: string;
  provider: string;
  terminalRef: string;
  name: string;
  host: string | null;
  port: number;
  mode: "bridge" | "external";
  agentId: string | null;
  isActive: boolean;
  label: string;
  status: string;
  lastSeenAt: string | null;
};

type ExternalRefForm = {
  terminalSlipNo: string;
  rrn: string;
  note: string;
};

type ContractArtworkFormLine = {
  itemId: string;
  artistName: string;
  title: string;
  year: string;
  techniqueSize: string;
  editionType: EditionType;
};

type ContractForm = {
  deliveryMethod: DeliveryMethod;
  estimatedDeliveryDate: string;
  artworks: ContractArtworkFormLine[];
};

type CheckoutDocuments = {
  txId: string | null;
  receiptPdfUrl: string | null;
  invoicePdfUrl: string | null;
  contractPdfUrl: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  step: CheckoutStep;
  onStepChange: (step: CheckoutStep) => void;
  customerType: CustomerType;
  onCustomerTypeChange: (value: CustomerType) => void;
  cart: CartLine[];
  totals: Totals;
  hasArtworkInCart: boolean;
  checkoutLocked: boolean;
  checkingOut: boolean;
  markingPaid: boolean;
  checkoutMessage: string | null;
  checkoutError: string | null;
  locations: PosLocation[];
  terminals: PosTerminal[];
  selectedTerminalId: string;
  onSelectedTerminalIdChange: (id: string) => void;
  selectedTerminal: PosTerminal | null;
  selectedLocation: PosLocation | null;
  paymentMethod: CheckoutPaymentMethod;
  onPaymentMethodChange: (method: CheckoutPaymentMethod) => void;
  bridgeFallbackAvailable: boolean;
  onSwitchToExternal: () => void;
  pendingExternalTxId: string | null;
  externalRefForm: ExternalRefForm;
  onExternalRefChange: (next: ExternalRefForm) => void;
  onMarkPaid: () => void;
  onStartCheckoutProcessing: () => void;
  buyerForm: BuyerForm;
  onBuyerChange: (key: keyof BuyerForm, value: string | boolean) => void;
  receiptEmailEnabled: boolean;
  onReceiptEmailEnabledChange: (value: boolean) => void;
  invoiceDetailsEnabled: boolean;
  onInvoiceDetailsEnabledChange: (value: boolean) => void;
  invoiceRequired: boolean;
  invoiceRequirementLabel: string | null;
  contractForm: ContractForm;
  onContractFormChange: (next: ContractForm) => void;
  signatureCanvasRef: RefObject<HTMLCanvasElement | null>;
  hasSignature: boolean;
  onClearSignature: () => void;
  onSignaturePointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onSignaturePointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  onSignaturePointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void;
  doneDocuments: CheckoutDocuments | null;
};

function euro(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

function stepTitle(step: CheckoutStep) {
  if (step === "receipt") return "Receipt / Invoice";
  if (step === "contract") return "Artwork Contract";
  if (step === "payment") return "Payment";
  if (step === "processing") return "Processing";
  return "Done";
}

export default function CheckoutFlowModal(props: Props) {
  const {
    open,
    onClose,
    step,
    onStepChange,
    customerType,
    onCustomerTypeChange,
    cart,
    totals,
    hasArtworkInCart,
    checkoutLocked,
    checkingOut,
    markingPaid,
    checkoutMessage,
    checkoutError,
    locations,
    terminals,
    selectedTerminalId,
    onSelectedTerminalIdChange,
    selectedTerminal,
    selectedLocation,
    paymentMethod,
    onPaymentMethodChange,
    bridgeFallbackAvailable,
    onSwitchToExternal,
    pendingExternalTxId,
    externalRefForm,
    onExternalRefChange,
    onMarkPaid,
    onStartCheckoutProcessing,
    buyerForm,
    onBuyerChange,
    receiptEmailEnabled,
    onReceiptEmailEnabledChange,
    invoiceDetailsEnabled,
    onInvoiceDetailsEnabledChange,
    invoiceRequired,
    invoiceRequirementLabel,
    contractForm,
    onContractFormChange,
    signatureCanvasRef,
    hasSignature,
    onClearSignature,
    onSignaturePointerDown,
    onSignaturePointerMove,
    onSignaturePointerUp,
    doneDocuments,
  } = props;

  if (!open) return null;

  const bridgeTerminals = terminals.filter((terminal) => terminal.isActive && terminal.mode === "bridge");
  const connectedOptionDisabled = bridgeTerminals.length === 0;
  const selectedTerminalIsExternalForced = selectedTerminal?.mode === "external";
  const effectiveInvoiceFieldsVisible = invoiceRequired || invoiceDetailsEnabled;

  const handleNextFromReceipt = () => {
    if (hasArtworkInCart) {
      onStepChange("contract");
      return;
    }
    onStepChange("payment");
  };

  const handleNextFromContract = () => {
    onStepChange("payment");
  };

  const stepIndex = ["receipt", "contract", "payment", "processing", "done"].indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Checkout</p>
            <h2 className="text-lg font-semibold text-slate-900">{stepTitle(step)}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-500 sm:inline">
              Step {Math.max(stepIndex + 1, 1)} / {hasArtworkInCart ? 5 : 4}
            </span>
            <button type="button" className="btnGhost" onClick={onClose} disabled={checkingOut || markingPaid}>
              Close
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
            {step === "receipt" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 rounded border border-slate-200 p-2">
                  <button
                    type="button"
                    className={`rounded px-3 py-2 text-sm font-semibold ${
                      customerType === "b2c" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                    onClick={() => onCustomerTypeChange("b2c")}
                  >
                    B2C
                  </button>
                  <button
                    type="button"
                    className={`rounded px-3 py-2 text-sm font-semibold ${
                      customerType === "b2b" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                    onClick={() => onCustomerTypeChange("b2b")}
                  >
                    B2B
                  </button>
                </div>

                <div className="rounded border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Receipt by email (optional)</p>
                      <p className="text-xs text-slate-600">Send a receipt copy to the customer.</p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={receiptEmailEnabled}
                        onChange={(event) => onReceiptEmailEnabledChange(event.target.checked)}
                      />
                      <span>{receiptEmailEnabled ? "On" : "Off"}</span>
                    </label>
                  </div>

                  {receiptEmailEnabled && (
                    <label className="space-y-1 block">
                      <span className="text-xs text-slate-600">Email</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={buyerForm.email}
                        onChange={(event) => onBuyerChange("email", event.target.value)}
                        placeholder="name@example.com"
                      />
                    </label>
                  )}
                </div>

                <div className="rounded border border-slate-200 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Invoice details</p>
                      <p className="text-xs text-slate-600">
                        {invoiceRequired
                          ? invoiceRequirementLabel || "Invoice details required for this order."
                          : "Only needed if customer requests an invoice."}
                      </p>
                    </div>
                    {!invoiceRequired && (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={invoiceDetailsEnabled}
                          onChange={(event) => onInvoiceDetailsEnabledChange(event.target.checked)}
                        />
                        <span>Add invoice details</span>
                      </label>
                    )}
                  </div>

                  {effectiveInvoiceFieldsVisible ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 sm:col-span-2">
                        <span className="text-xs text-slate-600">
                          {customerType === "b2b" ? "Buyer name / contact *" : "Buyer name *"}
                        </span>
                        <input
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          value={buyerForm.name}
                          onChange={(event) => onBuyerChange("name", event.target.value)}
                          placeholder="Walk-in customer"
                        />
                      </label>
                      {customerType === "b2b" && (
                        <label className="space-y-1 sm:col-span-2">
                          <span className="text-xs text-slate-600">Company *</span>
                          <input
                            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                            value={buyerForm.company}
                            onChange={(event) => onBuyerChange("company", event.target.value)}
                          />
                        </label>
                      )}
                      <label className="space-y-1 sm:col-span-2">
                        <span className="text-xs text-slate-600">Billing address *</span>
                        <textarea
                          rows={3}
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          value={buyerForm.billingAddress}
                          onChange={(event) => onBuyerChange("billingAddress", event.target.value)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-slate-600">Phone (optional)</span>
                        <input
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          value={buyerForm.phone}
                          onChange={(event) => onBuyerChange("phone", event.target.value)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-slate-600">Email (optional)</span>
                        <input
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          value={buyerForm.email}
                          onChange={(event) => onBuyerChange("email", event.target.value)}
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No invoice details required for this checkout.</p>
                  )}
                </div>

                {checkoutError && <p className="text-sm text-rose-700">{checkoutError}</p>}

                <div className="flex justify-end gap-2">
                  <button type="button" className="btnGhost" onClick={onClose}>
                    Cancel
                  </button>
                  <button type="button" className="btnPrimary" onClick={handleNextFromReceipt}>
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === "contract" && (
              <div className="space-y-4">
                <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Contract is required because the cart contains at least one artwork.
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="space-y-3 rounded border border-slate-200 p-3">
                    <h3 className="text-sm font-semibold">Buyer details</h3>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Name *</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={buyerForm.name}
                        onChange={(event) => onBuyerChange("name", event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Company</span>
                      <input
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={buyerForm.company}
                        onChange={(event) => onBuyerChange("company", event.target.value)}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Billing address *</span>
                      <textarea
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        rows={2}
                        value={buyerForm.billingAddress}
                        onChange={(event) => onBuyerChange("billingAddress", event.target.value)}
                      />
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={buyerForm.shippingSameAsBilling}
                        onChange={(event) => onBuyerChange("shippingSameAsBilling", event.target.checked)}
                      />
                      <span className="text-xs text-slate-600">Shipping same as billing</span>
                    </label>
                    {!buyerForm.shippingSameAsBilling && (
                      <label className="space-y-1">
                        <span className="text-xs text-slate-600">Shipping address *</span>
                        <textarea
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          rows={2}
                          value={buyerForm.shippingAddress}
                          onChange={(event) => onBuyerChange("shippingAddress", event.target.value)}
                        />
                      </label>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs text-slate-600">Email</span>
                        <input
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          value={buyerForm.email}
                          onChange={(event) => onBuyerChange("email", event.target.value)}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-slate-600">Phone</span>
                        <input
                          className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                          value={buyerForm.phone}
                          onChange={(event) => onBuyerChange("phone", event.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="space-y-3 rounded border border-slate-200 p-3">
                    <h3 className="text-sm font-semibold">Delivery and legal</h3>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Delivery method *</span>
                      <select
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={contractForm.deliveryMethod}
                        onChange={(event) =>
                          onContractFormChange({ ...contractForm, deliveryMethod: event.target.value as DeliveryMethod })
                        }
                      >
                        <option value="pickup">Pickup</option>
                        <option value="shipping">Shipping</option>
                        <option value="forwarding">Forwarding</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs text-slate-600">Estimated delivery date</span>
                      <input
                        type="date"
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={contractForm.estimatedDeliveryDate}
                        onChange={(event) =>
                          onContractFormChange({ ...contractForm, estimatedDeliveryDate: event.target.value })
                        }
                      />
                    </label>
                    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p>Seller signature: Artclub Mixed Media GmbH</p>
                      <p>Timestamp: {new Date().toLocaleString()}</p>
                      <p>Terms: https://artclub.wtf/policies/terms-of-service</p>
                    </div>
                  </section>
                </div>

                <section className="space-y-2 rounded border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold">Artwork details</h3>
                  <div className="space-y-3">
                    {contractForm.artworks.map((artwork, index) => (
                      <div key={artwork.itemId} className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-1">
                          <span className="text-xs text-slate-600">Artist name *</span>
                          <input
                            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                            value={artwork.artistName}
                            onChange={(event) =>
                              onContractFormChange({
                                ...contractForm,
                                artworks: contractForm.artworks.map((line, lineIndex) =>
                                  lineIndex === index ? { ...line, artistName: event.target.value } : line,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-600">Artwork title *</span>
                          <input
                            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                            value={artwork.title}
                            onChange={(event) =>
                              onContractFormChange({
                                ...contractForm,
                                artworks: contractForm.artworks.map((line, lineIndex) =>
                                  lineIndex === index ? { ...line, title: event.target.value } : line,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-600">Year</span>
                          <input
                            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                            value={artwork.year}
                            onChange={(event) =>
                              onContractFormChange({
                                ...contractForm,
                                artworks: contractForm.artworks.map((line, lineIndex) =>
                                  lineIndex === index ? { ...line, year: event.target.value } : line,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1 sm:col-span-2">
                          <span className="text-xs text-slate-600">Technique / size</span>
                          <input
                            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                            value={artwork.techniqueSize}
                            onChange={(event) =>
                              onContractFormChange({
                                ...contractForm,
                                artworks: contractForm.artworks.map((line, lineIndex) =>
                                  lineIndex === index ? { ...line, techniqueSize: event.target.value } : line,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs text-slate-600">Unique / edition</span>
                          <select
                            className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                            value={artwork.editionType}
                            onChange={(event) =>
                              onContractFormChange({
                                ...contractForm,
                                artworks: contractForm.artworks.map((line, lineIndex) =>
                                  lineIndex === index ? { ...line, editionType: event.target.value as EditionType } : line,
                                ),
                              })
                            }
                          >
                            <option value="unique">Unique</option>
                            <option value="edition">Edition</option>
                          </select>
                        </label>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-2 rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Buyer signature *</h3>
                    <button type="button" className="btnGhost" onClick={onClearSignature}>
                      Clear
                    </button>
                  </div>
                  <canvas
                    ref={signatureCanvasRef}
                    width={900}
                    height={220}
                    className="h-[160px] w-full rounded border border-slate-200 bg-white"
                    onPointerDown={onSignaturePointerDown}
                    onPointerMove={onSignaturePointerMove}
                    onPointerUp={onSignaturePointerUp}
                    onPointerLeave={onSignaturePointerUp}
                  />
                  {!hasSignature && <p className="text-xs text-amber-700">Draw buyer signature before continuing.</p>}
                </section>

                {checkoutError && <p className="text-sm text-rose-700">{checkoutError}</p>}

                <div className="flex justify-between gap-2">
                  <button type="button" className="btnGhost" onClick={() => onStepChange("receipt")}>
                    Back
                  </button>
                  <button type="button" className="btnPrimary" onClick={handleNextFromContract}>
                    Continue to payment
                  </button>
                </div>
              </div>
            )}

            {step === "payment" && (
              <div className="space-y-4">
                <div className="rounded border border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">Payment method</p>
                    <span className="text-xs text-slate-500">Select before starting</span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      className={`rounded border px-3 py-2 text-sm font-semibold ${
                        paymentMethod === "terminal_bridge"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700"
                      } ${connectedOptionDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                      onClick={() => onPaymentMethodChange("terminal_bridge")}
                      disabled={connectedOptionDisabled || checkoutLocked}
                    >
                      Terminal (connected)
                    </button>
                    <button
                      type="button"
                      className={`rounded border px-3 py-2 text-sm font-semibold ${
                        paymentMethod === "terminal_external"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                      onClick={() => onPaymentMethodChange("terminal_external")}
                      disabled={checkoutLocked}
                    >
                      External terminal
                    </button>
                    <button
                      type="button"
                      className={`rounded border px-3 py-2 text-sm font-semibold ${
                        paymentMethod === "cash" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                      }`}
                      onClick={() => onPaymentMethodChange("cash")}
                      disabled={checkoutLocked}
                    >
                      Cash
                    </button>
                  </div>

                  {connectedOptionDisabled && (
                    <p className="text-xs text-amber-700">
                      No connected bridge terminal configured yet. Add a bridge terminal in POS Settings or use External terminal/Cash.
                    </p>
                  )}

                  {bridgeFallbackAvailable && paymentMethod === "terminal_bridge" && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                      <p>No bridge agent online. You can switch to external terminal and continue selling.</p>
                      <button type="button" className="mt-2 rounded bg-amber-600 px-2 py-1 text-white" onClick={onSwitchToExternal}>
                        Switch to external terminal
                      </button>
                    </div>
                  )}
                </div>

                {paymentMethod !== "cash" && (
                  <div className="rounded border border-slate-200 p-4 space-y-3">
                    <p className="text-sm font-semibold text-slate-900">Terminal selection</p>
                    <label className="space-y-1 block">
                      <span className="text-xs text-slate-600">Terminal</span>
                      <select
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={selectedTerminalId}
                        onChange={(event) => onSelectedTerminalIdChange(event.target.value)}
                      >
                        {terminals.length === 0 ? <option value="">No terminals configured</option> : null}
                        {terminals.map((terminal) => {
                          const location = locations.find((entry) => entry.id === terminal.locationId);
                          return (
                            <option key={terminal.id} value={terminal.id}>
                              {terminal.label} {location ? `(${location.name})` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    {selectedLocation && (
                      <p className="text-xs text-slate-500">
                        {selectedLocation.name} · {selectedLocation.address}
                      </p>
                    )}
                    {selectedTerminal && (
                      <p className="text-xs text-slate-500">
                        Mode: {selectedTerminal.mode} · Status: {selectedTerminal.status}
                        {selectedTerminal.host ? ` · ${selectedTerminal.host}:${selectedTerminal.port}` : ""}
                      </p>
                    )}
                    {paymentMethod === "terminal_bridge" && selectedTerminalIsExternalForced && (
                      <p className="text-xs text-amber-700">Selected terminal is external-only. Choose a bridge terminal or switch payment method.</p>
                    )}
                  </div>
                )}

                {paymentMethod === "terminal_external" && (
                  <div className="rounded border border-slate-200 p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-900">External terminal notes (optional)</p>
                    <p className="text-xs text-slate-600">After payment on the terminal, you will confirm in the next step.</p>
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Slip no. (optional)"
                      value={externalRefForm.terminalSlipNo}
                      onChange={(event) => onExternalRefChange({ ...externalRefForm, terminalSlipNo: event.target.value })}
                    />
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      placeholder="RRN (optional)"
                      value={externalRefForm.rrn}
                      onChange={(event) => onExternalRefChange({ ...externalRefForm, rrn: event.target.value })}
                    />
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Note (optional)"
                      value={externalRefForm.note}
                      onChange={(event) => onExternalRefChange({ ...externalRefForm, note: event.target.value })}
                    />
                  </div>
                )}

                {paymentMethod === "cash" && (
                  <div className="rounded border border-slate-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    Cash payment flow: click <strong>Start payment</strong>, then confirm in the next step with <strong>Mark as paid</strong>.
                  </div>
                )}

                {checkoutError && <p className="text-sm text-rose-700">{checkoutError}</p>}

                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="btnGhost"
                    onClick={() => onStepChange(hasArtworkInCart ? "contract" : "receipt")}
                    disabled={checkingOut}
                  >
                    Back
                  </button>
                  <button type="button" className="btnPrimary" onClick={onStartCheckoutProcessing} disabled={checkingOut}>
                    {checkingOut ? "Starting..." : "Start payment"}
                  </button>
                </div>
              </div>
            )}

            {step === "processing" && (
              <div className="space-y-4">
                <div className="rounded border border-slate-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {paymentMethod === "terminal_bridge" ? "Waiting for terminal..." : paymentMethod === "cash" ? "Cash confirmation" : "External terminal"}
                  </p>
                  {paymentMethod === "terminal_bridge" && (
                    <p className="text-sm text-slate-600">
                      Follow the terminal prompts. This screen polls payment status automatically.
                    </p>
                  )}
                  {paymentMethod !== "terminal_bridge" && (
                    <p className="text-sm text-slate-600">
                      Complete the payment externally, then confirm it here with “Mark as paid”.
                    </p>
                  )}
                  {pendingExternalTxId && <p className="text-xs text-slate-500">Transaction: {pendingExternalTxId}</p>}
                  {checkoutMessage && <p className="text-sm text-emerald-700">{checkoutMessage}</p>}
                  {checkoutError && <p className="text-sm text-rose-700">{checkoutError}</p>}
                </div>

                {paymentMethod !== "terminal_bridge" && (
                  <div className="rounded border border-slate-200 p-4 space-y-2">
                    <p className="text-sm font-semibold text-slate-900">Reference fields (optional)</p>
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Slip no. (optional)"
                      value={externalRefForm.terminalSlipNo}
                      onChange={(event) => onExternalRefChange({ ...externalRefForm, terminalSlipNo: event.target.value })}
                      disabled={!pendingExternalTxId || markingPaid}
                    />
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      placeholder="RRN (optional)"
                      value={externalRefForm.rrn}
                      onChange={(event) => onExternalRefChange({ ...externalRefForm, rrn: event.target.value })}
                      disabled={!pendingExternalTxId || markingPaid}
                    />
                    <input
                      className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                      placeholder={paymentMethod === "cash" ? "Note (e.g. cash)" : "Note (optional)"}
                      value={externalRefForm.note}
                      onChange={(event) => onExternalRefChange({ ...externalRefForm, note: event.target.value })}
                      disabled={!pendingExternalTxId || markingPaid}
                    />
                    <button
                      type="button"
                      className="btnPrimary"
                      onClick={onMarkPaid}
                      disabled={!pendingExternalTxId || markingPaid}
                    >
                      {markingPaid ? "Marking..." : "Mark as paid"}
                    </button>
                  </div>
                )}

                <div className="flex justify-between gap-2">
                  <button type="button" className="btnGhost" onClick={onClose} disabled={checkingOut || markingPaid}>
                    Cancel
                  </button>
                  {pendingExternalTxId && (
                    <button type="button" className="btnGhost" onClick={() => onStepChange("payment")} disabled={checkingOut || markingPaid}>
                      Back to payment options
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === "done" && (
              <div className="space-y-4">
                <div className="rounded border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Payment completed</p>
                  {doneDocuments?.txId && <p className="mt-1 text-xs text-emerald-800">Transaction {doneDocuments.txId}</p>}
                  {checkoutMessage && <p className="mt-2 text-sm text-emerald-800">{checkoutMessage}</p>}
                </div>

                <div className="rounded border border-slate-200 p-4 space-y-2">
                  <p className="text-sm font-semibold text-slate-900">Downloads</p>
                  <div className="flex flex-col gap-2 text-sm">
                    {doneDocuments?.receiptPdfUrl ? (
                      <a className="rounded border border-slate-200 px-3 py-2 hover:bg-slate-50" href={doneDocuments.receiptPdfUrl} target="_blank" rel="noreferrer">
                        Receipt PDF
                      </a>
                    ) : (
                      <span className="rounded border border-dashed border-slate-200 px-3 py-2 text-slate-500">Receipt is not available yet.</span>
                    )}
                    {doneDocuments?.invoicePdfUrl && (
                      <a className="rounded border border-slate-200 px-3 py-2 hover:bg-slate-50" href={doneDocuments.invoicePdfUrl} target="_blank" rel="noreferrer">
                        Invoice PDF
                      </a>
                    )}
                    {doneDocuments?.contractPdfUrl && (
                      <a className="rounded border border-slate-200 px-3 py-2 hover:bg-slate-50" href={doneDocuments.contractPdfUrl} target="_blank" rel="noreferrer">
                        Contract PDF
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button type="button" className="btnPrimary" onClick={onClose}>
                    Close checkout
                  </button>
                </div>
              </div>
            )}
          </div>

          <aside className="border-t border-slate-200 bg-slate-50/80 p-4 lg:border-l lg:border-t-0">
            <div className="space-y-3 lg:sticky lg:top-0">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Order Summary</p>
                <h3 className="text-base font-semibold text-slate-900">{cart.length} line items</h3>
              </div>

              <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
                {cart.map((line) => (
                  <div key={line.itemId} className="rounded border border-slate-200 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{line.title}</p>
                        {line.artistName && <p className="text-xs text-slate-500">{line.artistName}</p>}
                        <p className="text-xs text-slate-500">
                          {line.qty} × {euro(line.priceGrossCents)}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">{euro(line.qty * line.priceGrossCents)}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 rounded border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Gross</span>
                  <span className="font-semibold">{euro(totals.grossCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Net</span>
                  <span className="font-semibold">{euro(totals.netCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">VAT</span>
                  <span className="font-semibold">{euro(totals.vatCents)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// GeraiVaultDO tenant tables (ADR-0006 §2). Mirrors packages/db/migrations/tenant/*.sql (drift test).
import { sql } from "drizzle-orm"
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const tenantSettings = sqliteTable("tenant_settings", {
  tenantId: text("tenant_id").primaryKey(),
  defaultLabelFormat: text("default_label_format", { enum: ["label_10x15_with_stub", "label_10x10", "label_10x15", "roll_58mm"] }).notNull().default("label_10x15_with_stub"),
  unboxingRemarkText: text("unboxing_remark_text").notNull().default("Rekam video saat buka paket untuk klaim"),
  showCommissionOnQuickCheck: integer("show_commission_on_quick_check").notNull().default(0),
  counterServiceFeeEnabled: integer("counter_service_fee_enabled").notNull().default(0),
  counterServiceFeeDefaultIdr: integer("counter_service_fee_default_idr"),
  cargoRecommendThresholdGram: integer("cargo_recommend_threshold_gram").notNull().default(5000),
  cashierMayPaySenderCod: integer("cashier_may_pay_sender_cod").notNull().default(0),
  maskingOffered: integer("masking_offered").notNull().default(0),
  maskingPresetsEnabled: text("masking_presets_enabled").notNull().default("[]"),
  maskingDefaultPreset: text("masking_default_preset").notNull().default("standar_gerai"),
  maskRecipientPhoneOnCodDefault: integer("mask_recipient_phone_on_cod_default").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
  updatedBy: text("updated_by"),
  mengantarDropshipperSync: integer("mengantar_dropshipper_sync").notNull().default(0),
  mengantarDropshipperState: text("mengantar_dropshipper_state", { enum: ["ok", "disabled"] }),
})

export const tenantBusinessProfiles = sqliteTable("tenant_business_profiles", {
  tenantId: text("tenant_id").primaryKey(),
  entityType: text("entity_type", { enum: ["perorangan", "ud", "cv", "pt", "koperasi", "lainnya"] }),
  legalName: text("legal_name"),
  brandName: text("brand_name"),
  nib: text("nib"),
  encryptedNpwp: text("encrypted_npwp"),
  registeredAddress: text("registered_address"),
  picName: text("pic_name"),
  picRole: text("pic_role"),
  picEmail: text("pic_email"),
  picPhone: text("pic_phone"),
  updatedBy: text("updated_by"),
  updatedAt: integer("updated_at"),
})

export const tenantOutlets = sqliteTable("tenant_outlets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  picName: text("pic_name"),
  picPhone: text("pic_phone"),
  mengantarAddressId: text("mengantar_address_id"),
  mengantarAreaId: text("mengantar_area_id"),
  provinceName: text("province_name"),
  cityName: text("city_name"),
  districtName: text("district_name"),
  subdistrictName: text("subdistrict_name"),
  postalCode: text("postal_code"),
  streetAddress: text("street_address"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  whatsapp: text("whatsapp"),
  openingHours: text("opening_hours"),
  logoMediaId: text("logo_media_id"),
  qrisMediaId: text("qris_media_id"),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    at: integer("at").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    reason: text("reason"),
    metadataJson: text("metadata_json"),
  },
  (t) => [index("audit_logs_at").on(t.at)],
)

export const outbox = sqliteTable(
  "outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    topic: text("topic").notNull(),
    entityKey: text("entity_key").notNull(),
    version: integer("version").notNull(),
    payloadJson: text("payload_json").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("outbox_due").on(t.nextAttemptAt)],
)

export const invSlugs = sqliteTable("inv_slugs", {
  slug: text("slug").primaryKey(),
  purpose: text("purpose", { enum: ["draft", "minisite_qr", "bulk", "api"] }).notNull(),
  createdAt: integer("created_at").notNull(),
})

export const mengantarConnections = sqliteTable("mengantar_connections", {
  tenantId: text("tenant_id").primaryKey(),
  environment: text("environment", { enum: ["sandbox", "production"] }).notNull(),
  onboardingState: text("onboarding_state").notNull().default("not_connected"),
  webhookState: text("webhook_state").notNull().default("unconfigured"),
  sellerId: text("seller_id"),
  externalUserId: text("external_user_id"),
  encryptedApiKey: text("encrypted_api_key"),
  keyVersion: integer("key_version").notNull().default(0),
  webhookPathToken: text("webhook_path_token"),
  encryptedWebhookSecret: text("encrypted_webhook_secret"),
  syncedBalanceIdr: integer("synced_balance_idr"),
  lastInvoiceSyncedAt: integer("last_invoice_synced_at"),
  lastSyncStatus: text("last_sync_status"),
  updatedAt: integer("updated_at").notNull(),
  webhookLastEventAt: integer("webhook_last_event_at"),
  webhookLastFailureAt: integer("webhook_last_failure_at"),
  lastPolledAt: integer("last_polled_at"),
  rotationState: text("rotation_state", { enum: ["idle", "in_flight", "unknown"] }).notNull().default("idle"),
  rotationStartedAt: integer("rotation_started_at"),
  previousWebhookPathToken: text("previous_webhook_path_token"),
  encryptedPreviousWebhookSecret: text("encrypted_previous_webhook_secret"),
  previousTokenExpiresAt: integer("previous_token_expires_at"),
})

export const shipments = sqliteTable(
  "shipments",
  {
    tenantId: text("tenant_id").notNull(),
    slug: text("slug").notNull(),
    courierCode: text("courier_code"),
    mengantarOrderCode: text("mengantar_order_code"),
    awbNumber: text("awb_number"),
    status: text("status").notNull(),
    providerStatus: text("provider_status"),
    lastProviderEventAt: integer("last_provider_event_at"),
    lastProviderRank: integer("last_provider_rank"),
    custodyStage: text("custody_stage", { enum: ["none", "handed_to_courier", "rts_at_gerai", "rts_returned_to_sender", "cancelled_local"] }).notNull().default("none"),
    custodyAt: integer("custody_at"),
    providerStatusConflictAt: integer("provider_status_conflict_at"),
    stuckAttentionAt: integer("stuck_attention_at"),
    lastPolledAt: integer("last_polled_at"),
    indexVersion: integer("index_version").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    quoteSnapshotId: text("quote_snapshot_id"),
    entryChannel: text("entry_channel").notNull().default("counter_pos"),
    outletId: text("outlet_id"),
    senderContactId: text("sender_contact_id"),
    recipientContactId: text("recipient_contact_id"),
    cashierShiftId: text("cashier_shift_id"),
    createdByUserId: text("created_by_user_id"),
    dispatchState: text("dispatch_state").notNull().default("draft"),
    dispatchError: text("dispatch_error"),
    serviceCode: text("service_code"),
    isCargo: integer("is_cargo").notNull().default(0),
    codFeeMode: text("cod_fee_mode"),
    mengantarOrderItemId: text("mengantar_order_item_id"),
    mengantarBatchCode: text("mengantar_batch_code"),
    mengantarBatchObjectId: text("mengantar_batch_object_id"),
    paymentSyncState: text("payment_sync_state").notNull().default("unissued"),
    sortingCode: text("sorting_code"),
    providerEchoedWeightKgText: text("provider_echoed_weight_kg_text"),
    providerCodFeeRawText: text("provider_cod_fee_raw_text"),
    quoteDrift: integer("quote_drift").notNull().default(0),
    trueSenderJson: text("true_sender_json"),
    trueRecipientJson: text("true_recipient_json"),
    contentDeclarationText: text("content_declaration_text"),
    prohibitedAckAt: integer("prohibited_ack_at"),
    publishShippingIdr: integer("publish_shipping_idr"),
    geraiShippingCostIdr: integer("gerai_shipping_cost_idr"),
    packingAddonIdr: integer("packing_addon_idr").notNull().default(0),
    counterServiceFeeIdr: integer("counter_service_fee_idr").notNull().default(0),
    promoDiscountIdr: integer("promo_discount_idr").notNull().default(0),
    insuranceFeeIdr: integer("insurance_fee_idr"),
    codGoodsAmountIdr: integer("cod_goods_amount_idr").notNull().default(0),
    codServiceFeeIdr: integer("cod_service_fee_idr").notNull().default(0),
    codCollectionTotalIdr: integer("cod_collection_total_idr").notNull().default(0),
    counterDueIdr: integer("counter_due_idr").notNull().default(0),
    counterTotalPaidIdr: integer("counter_total_paid_idr").notNull().default(0),
    expectedProviderCodCreditIdr: integer("expected_provider_cod_credit_idr").notNull().default(0),
    senderCodPayableIdr: integer("sender_cod_payable_idr").notNull().default(0),
    actualWeightGram: integer("actual_weight_gram"),
    billableWeightGram: integer("billable_weight_gram"),
    counterPaymentStatus: text("counter_payment_status").notNull().default("unpaid"),
    counterPaymentMethod: text("counter_payment_method"),
    counterPaidAt: integer("counter_paid_at"),
    counterPaidBy: text("counter_paid_by"),
    counterPaidShiftId: text("counter_paid_shift_id"),
    counterPaymentNote: text("counter_payment_note"),
    firstPrintedAt: integer("first_printed_at"),
    printCount: integer("print_count").notNull().default(0),
    issuedAt: integer("issued_at"),
    cancelledAt: integer("cancelled_at"),
    maskPreset: text("mask_preset", { enum: ["standar_gerai", "dropship_toko", "privasi_penerima_cod", "full_nama_gerai"] }).notNull().default("standar_gerai"),
    maskSnapshotJson: text("mask_snapshot_json"),
    pickupSnapshotJson: text("pickup_snapshot_json"),
    senderCodPaidIdr: integer("sender_cod_paid_idr"),
    reconciledProviderCodCreditIdr: integer("reconciled_provider_cod_credit_idr"),
    bulkBatchId: text("bulk_batch_id"),
    providerReconciledCostIdr: integer("provider_reconciled_cost_idr"),
    reconciledExtraAdjustmentIdr: integer("reconciled_extra_adjustment_idr"),
    pickupBatchId: text("pickup_batch_id"),
    conflictNote: text("conflict_note"),
    conflictResolvedAt: integer("conflict_resolved_at"),
    itemQuantity: integer("item_quantity").notNull().default(1),
    deliveryInstruction: text("delivery_instruction"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.slug] }), index("shipments_awb").on(t.awbNumber), index("shipments_order_code").on(t.mengantarOrderCode)],
)

export const shipmentEvents = sqliteTable(
  "shipment_events",
  {
    eventKey: text("event_key").primaryKey(),
    slug: text("slug").notNull(),
    source: text("source", { enum: ["webhook", "poll", "local"] }).notNull(),
    rawCategory: text("raw_category"),
    mappedStatus: text("mapped_status"),
    eventAt: integer("event_at").notNull(),
    eventAtText: text("event_at_text"),
    recordedAt: integer("recorded_at").notNull(),
  },
  (t) => [index("shipment_events_slug").on(t.slug, t.eventAt)],
)

export const webhookInbox = sqliteTable(
  "webhook_inbox",
  {
    eventKey: text("event_key").primaryKey(),
    providerTimestampRaw: text("provider_timestamp_raw").notNull(),
    providerEventAt: integer("provider_event_at").notNull(),
    receivedAt: integer("received_at").notNull(),
    rawBody: text("raw_body").notNull(),
    state: text("state", { enum: ["received", "applied", "rejected"] }).notNull().default("received"),
    appliedAt: integer("applied_at"),
    error: text("error"),
  },
  (t) => [index("webhook_inbox_state").on(t.state, t.receivedAt)],
)

export const vaultTimers = sqliteTable("vault_timers", {
  name: text("name").primaryKey(),
  dueAt: integer("due_at").notNull(),
})

export const tenantCourierPrefs = sqliteTable(
  "tenant_courier_prefs",
  {
    tenantId: text("tenant_id").notNull(),
    courierCode: text("courier_code").notNull(),
    enabled: integer("enabled").notNull(),
    pickupMode: text("pickup_mode", { enum: ["scheduled_pickup", "drop_off_only"] }).notNull(),
    updatedAt: integer("updated_at").notNull(),
    updatedBy: text("updated_by"),
    codBlockedAt: integer("cod_blocked_at"),
    codBlockedStatus: text("cod_blocked_status"),
    codDeliveredRate: integer("cod_delivered_rate"),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.courierCode] })],
)

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    kind: text("kind").notNull(),
    audience: text("audience", { enum: ["all", "owner"] }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notifications_created").on(t.createdAt)],
)

export const notificationReads = sqliteTable(
  "notification_reads",
  {
    notificationId: text("notification_id").notNull(),
    userId: text("user_id").notNull(),
    readAt: integer("read_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
)

export const senderContacts = sqliteTable(
  "sender_contacts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    senderKind: text("sender_kind", { enum: ["walk_in", "reseller_dropship"] }).notNull(),
    trueName: text("true_name").notNull(),
    truePhone: text("true_phone").notNull(),
    waVerifiedAt: integer("wa_verified_at"),
    waVerifiedBy: text("wa_verified_by"),
    waVerifyMethod: text("wa_verify_method", { enum: ["operator_confirmed"] }),
    trueStreet: text("true_street"),
    trueAreaId: text("true_area_id"),
    trueAreaLabel: text("true_area_label"),
    truePostalCode: text("true_postal_code"),
    displayBrandName: text("display_brand_name"),
    displayBrandPhone: text("display_brand_phone"),
    hideGeraiBranding: integer("hide_gerai_branding").notNull().default(0),
    defaultMaskPreset: text("default_mask_preset"),
    depositBalanceIdr: integer("deposit_balance_idr").notNull().default(0),
    shipmentsCount: integer("shipments_count").notNull().default(0),
    isArchived: integer("is_archived").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    mengantarDropshipperId: text("mengantar_dropshipper_id"),
    mengantarDropshipperKey: text("mengantar_dropshipper_key"),
  },
  (t) => [index("sender_contacts_phone").on(t.truePhone), index("sender_contacts_name").on(t.trueName)],
)

export const recipientContacts = sqliteTable(
  "recipient_contacts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    linkedSenderId: text("linked_sender_id"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    mengantarAreaId: text("mengantar_area_id"),
    provinceName: text("province_name"),
    cityName: text("city_name"),
    districtName: text("district_name"),
    subdistrictName: text("subdistrict_name"),
    postalCode: text("postal_code"),
    streetAddress: text("street_address").notNull(),
    addressNote: text("address_note"),
    codDeliveredCount: integer("cod_delivered_count").notNull().default(0),
    codRtsCount: integer("cod_rts_count").notNull().default(0),
    riskVersion: integer("risk_version").notNull().default(0),
    isArchived: integer("is_archived").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("recipient_contacts_phone").on(t.phone), index("recipient_contacts_name").on(t.name)],
)

export const mediaObjects = sqliteTable("media_objects", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  r2Key: text("r2_key").notNull().unique(),
  purpose: text("purpose", { enum: ["logo", "qris", "evidence", "return_photo", "claim", "signature"] }).notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: integer("created_at").notNull(),
})

export const quoteSnapshots = sqliteTable(
  "quote_snapshots",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    shipmentSlug: text("shipment_slug").notNull(),
    originAreaId: text("origin_area_id").notNull(),
    destinationAreaId: text("destination_area_id").notNull(),
    codFeeMode: text("cod_fee_mode", { enum: ["none", "buyer_bears_fee", "sender_bears_fee", "cod_all_in", "dfod"] }).notNull(),
    actualWeightGram: integer("actual_weight_gram").notNull(),
    lengthCm: integer("length_cm"),
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),
    volumetricDivisor: integer("volumetric_divisor").notNull(),
    billableWeightGram: integer("billable_weight_gram").notNull(),
    providerWeightKgText: text("provider_weight_kg_text").notNull(),
    courierCode: text("courier_code").notNull(),
    serviceCode: text("service_code").notNull(),
    serviceClass: text("service_class", { enum: ["regular", "cargo"] }).notNull(),
    publishShippingIdr: integer("publish_shipping_idr").notNull(),
    providerNetShippingIdr: integer("provider_net_shipping_idr").notNull(),
    rawDiscountPercent: text("raw_discount_percent"),
    providerObservedDiscountBps: integer("provider_observed_discount_bps"),
    assignedGeraiDiscountBps: integer("assigned_gerai_discount_bps"),
    effectiveGeraiCostIdr: integer("effective_gerai_cost_idr").notNull(),
    insuranceFeeIdr: integer("insurance_fee_idr"),
    codFeeIdr: integer("cod_fee_idr").notNull(),
    codGoodsAmountIdr: integer("cod_goods_amount_idr").notNull(),
    codCollectionTotalIdr: integer("cod_collection_total_idr").notNull(),
    counterDueIdr: integer("counter_due_idr").notNull(),
    senderCodPayableIdr: integer("sender_cod_payable_idr").notNull(),
    expectedProviderCodCreditIdr: integer("expected_provider_cod_credit_idr").notNull(),
    packingAddonIdr: integer("packing_addon_idr").notNull().default(0),
    estimatedMarginIdr: integer("estimated_margin_idr").notNull(),
    quotedAt: integer("quoted_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    counterServiceFeeIdr: integer("counter_service_fee_idr").notNull().default(0),
    promoDiscountIdr: integer("promo_discount_idr").notNull().default(0),
    declaredValueIdr: integer("declared_value_idr").notNull().default(0),
    isDangerousGoods: integer("is_dangerous_goods").notNull().default(0),
  },
  (t) => [index("quote_snapshots_slug").on(t.shipmentSlug, t.quotedAt)],
)

export const dispatchJournal = sqliteTable(
  "dispatch_journal",
  {
    idempotencyKey: text("idempotency_key").primaryKey(),
    slug: text("slug").notNull(),
    op: text("op", { enum: ["create_order", "pay_unpaid", "cancel_order"] }).notNull(),
    state: text("state", { enum: ["in_flight", "done", "failed", "unknown"] }).notNull(),
    requestJson: text("request_json"),
    resultJson: text("result_json"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("dispatch_journal_slug").on(t.slug, t.createdAt)],
)

export const counterReceipts = sqliteTable(
  "counter_receipts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    shipmentSlug: text("shipment_slug").notNull(),
    event: text("event", { enum: ["mark_paid", "void_payment", "sender_cod_payout", "void_sender_payout"] }).notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    amountIdr: integer("amount_idr").notNull(),
    method: text("method", { enum: ["qris", "tunai", "transfer", "deposit"] }).notNull(),
    cashReceivedIdr: integer("cash_received_idr"),
    changeIdr: integer("change_idr"),
    shiftId: text("shift_id"),
    actorUserId: text("actor_user_id").notNull(),
    reason: text("reason"),
    voidsReceiptId: text("voids_receipt_id"),
    bulkBatchId: text("bulk_batch_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("counter_receipts_slug").on(t.shipmentSlug, t.createdAt), index("counter_receipts_shift").on(t.shiftId)],
)

export const maskingUsage = sqliteTable("masking_usage", {
  wibDay: text("wib_day").primaryKey(),
  count: integer("count").notNull(),
})

export const cashierShifts = sqliteTable(
  "cashier_shifts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    cashierUserId: text("cashier_user_id").notNull(),
    openedAt: integer("opened_at").notNull(),
    openingFloatIdr: integer("opening_float_idr").notNull(),
    closedAt: integer("closed_at"),
    countedCashIdr: integer("counted_cash_idr"),
    expectedCashIdr: integer("expected_cash_idr"),
    varianceIdr: integer("variance_idr"),
    varianceReasonCode: text("variance_reason_code", { enum: ["salah_kembalian", "uang_palsu", "lupa_catat", "pengeluaran_kecil", "selisih_lain"] }),
    varianceNote: text("variance_note"),
    state: text("state", { enum: ["open", "closed"] }).notNull(),
  },
  (t) => [uniqueIndex("cashier_shifts_one_open").on(t.cashierUserId).where(sql`state = 'open'`), index("cashier_shifts_opened").on(t.openedAt)],
)

// TASK-308 Paket Massal (spec 01 §2.5).
export const bulkImportBatches = sqliteTable(
  "bulk_import_batches",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    senderContactId: text("sender_contact_id").notNull(),
    source: text("source", { enum: ["manual", "csv", "xlsx"] }).notNull(),
    fileName: text("file_name"),
    maskPreset: text("mask_preset").notNull().default("standar_gerai"),
    codFeeMode: text("cod_fee_mode").notNull().default("none"),
    serviceCode: text("service_code"),
    rowCount: integer("row_count").notNull().default(0),
    readyCount: integer("ready_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    state: text("state", { enum: ["draft", "checking", "ready", "dispatching", "done", "partially_failed", "cancelled"] }).notNull(),
    counterPaymentStatus: text("counter_payment_status", { enum: ["not_required", "unpaid", "paid", "voided"] }).notNull().default("unpaid"),
    paymentIdempotencyKey: text("payment_idempotency_key"),
    cashReceivedIdr: integer("cash_received_idr"),
    changeIdr: integer("change_idr"),
    dispatchLeaseUntil: integer("dispatch_lease_until"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("bulk_import_batches_created").on(t.createdAt)],
)

export const bulkImportRows = sqliteTable(
  "bulk_import_rows",
  {
    batchId: text("batch_id").notNull(),
    rowNo: integer("row_no").notNull(),
    rawJson: text("raw_json").notNull(),
    recipientName: text("recipient_name"),
    recipientPhone: text("recipient_phone"),
    street: text("street"),
    areaText: text("area_text"),
    areaId: text("area_id"),
    areaLabel: text("area_label"),
    postalCode: text("postal_code"),
    content: text("content"),
    weightGram: integer("weight_gram"),
    lengthCm: integer("length_cm"),
    widthCm: integer("width_cm"),
    heightCm: integer("height_cm"),
    codGoodsIdr: integer("cod_goods_idr").notNull().default(0),
    declaredValueIdr: integer("declared_value_idr").notNull().default(0),
    note: text("note"),
    errorsJson: text("errors_json"),
    candidatesJson: text("candidates_json"),
    quoteJson: text("quote_json"),
    quotedAt: integer("quoted_at"),
    publishShippingIdr: integer("publish_shipping_idr"),
    codFeeIdr: integer("cod_fee_idr"),
    counterDueIdr: integer("counter_due_idr"),
    codCollectionTotalIdr: integer("cod_collection_total_idr"),
    senderCodPayableIdr: integer("sender_cod_payable_idr"),
    estimatedMarginIdr: integer("estimated_margin_idr"),
    serviceCode: text("service_code"),
    dispatchAttemptedAt: integer("dispatch_attempted_at"),
    dispatchError: text("dispatch_error"),
    state: text("state", { enum: ["pending", "needs_fix", "ready", "created", "removed"] }).notNull(),
    shipmentSlug: text("shipment_slug"),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.rowNo] }), index("bulk_import_rows_slug").on(t.shipmentSlug)],
)

// TASK-310 packing add-on catalogue.
export const packingItems = sqliteTable("packing_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priceIdr: integer("price_idr").notNull(),
  isActive: integer("is_active").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: integer("updated_at").notNull(),
})

// TASK-401 Book 2 — Mengantar seller mirror (spec 09).
export const mengantarInvoiceMirror = sqliteTable(
  "mengantar_invoice_mirror",
  {
    invoiceId: text("invoice_id").primaryKey(),
    invNumber: text("inv_number"),
    type: text("type").notNull(),
    status: text("status"),
    courier: text("courier"),
    orderCode: text("order_code"),
    awbNumber: text("awb_number"),
    amountIdr: integer("amount_idr"),
    totalIdr: integer("total_idr"),
    balanceAmountIdr: integer("balance_amount_idr"),
    description: text("description"),
    providerCreatedAt: integer("provider_created_at"),
    providerUpdatedAt: integer("provider_updated_at"),
    rawJson: text("raw_json").notNull(),
    linkState: text("link_state", { enum: ["linked", "partial", "unlinked", "not_applicable", "unknown_type"] }).notNull(),
    firstSeenAt: integer("first_seen_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
  },
  (t) => [index("mengantar_invoice_mirror_created").on(t.providerCreatedAt), index("mengantar_invoice_mirror_state").on(t.linkState)],
)

export const mengantarInvoiceSubitems = sqliteTable(
  "mengantar_invoice_subitems",
  {
    invoiceId: text("invoice_id").notNull(),
    idx: integer("idx").notNull(),
    awbNumber: text("awb_number"),
    orderCode: text("order_code"),
    batchCode: text("batch_code"),
    amountIdr: integer("amount_idr"),
    codAmountIdr: integer("cod_amount_idr"),
    estimatedPriceIdr: integer("estimated_price_idr"),
    estimatedSpecialPriceIdr: integer("estimated_special_price_idr"),
    codFeeRawText: text("cod_fee_raw_text"),
    shipmentSlug: text("shipment_slug"),
  },
  (t) => [primaryKey({ columns: [t.invoiceId, t.idx] }), index("mengantar_invoice_subitems_slug").on(t.shipmentSlug)],
)

export const financeDiscrepancies = sqliteTable(
  "finance_discrepancies",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    kind: text("kind", { enum: ["unknown_type", "unmatched", "cod_credit_differs", "debit_differs", "adjustment", "balance_gap"] }).notNull(),
    shipmentSlug: text("shipment_slug"),
    expectedIdr: integer("expected_idr"),
    actualIdr: integer("actual_idr"),
    detail: text("detail"),
    resolvedAt: integer("resolved_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("finance_discrepancies_key").on(t.invoiceId, t.kind, t.shipmentSlug)],
)

export const financeSyncState = sqliteTable("finance_sync_state", {
  id: integer("id").primaryKey(),
  lastRunAt: integer("last_run_at"),
  lastOkAt: integer("last_ok_at"),
  lastTrigger: text("last_trigger"),
  lastPages: integer("last_pages"),
  lastError: text("last_error"),
  lastManualAt: integer("last_manual_at"),
  lastPendingRescanAt: integer("last_pending_rescan_at"),
  runningSince: integer("running_since"),
  backfillCursor: text("backfill_cursor"),
  rescanCursor: text("rescan_cursor"),
  rescanRange: text("rescan_range"),
})

// Per-API-key daily Rupiah cap ledger (spec 08 §2), one row per INV, committed with the dispatch journal.
export const apiKeySpend = sqliteTable(
  "api_key_spend",
  {
    slug: text("slug").primaryKey(),
    keyId: text("key_id").notNull(),
    wibDay: text("wib_day").notNull(),
    amountIdr: integer("amount_idr").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("api_key_spend_key_day").on(t.keyId, t.wibDay)],
)

// DEC-238: one Mengantar `POST /time` slot per (address, date, hour), reused while still ahead.
export const pickupTimeSlots = sqliteTable(
  "pickup_time_slots",
  {
    addressId: text("address_id").notNull(),
    slotDate: text("slot_date").notNull(),
    slotTime: text("slot_time").notNull(),
    timeId: text("time_id").notNull(),
    startsAt: integer("starts_at").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.addressId, t.slotDate, t.slotTime] })],
)

// DEC-238: Mengantar receiver score cache (24 h per phone, 403/429 outcomes included).
export const receiverScoreCache = sqliteTable("receiver_score_cache", {
  phone: text("phone").primaryKey(),
  state: text("state", { enum: ["ok", "forbidden", "limited"] }).notNull(),
  grade: text("grade"),
  approximate: integer("approximate").notNull().default(0),
  averageRateX10: integer("average_rate_x10"),
  total: integer("total").notNull().default(0),
  delivered: integer("delivered").notNull().default(0),
  rts: integer("rts").notNull().default(0),
  fetchedAt: integer("fetched_at").notNull(),
})

// TASK-403 pickup manifests (Surat Jalan).
export const pickupBatches = sqliteTable(
  "pickup_batches",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    outletId: text("outlet_id"),
    courierCode: text("courier_code").notNull(),
    status: text("status", { enum: ["open", "handed_over", "dropped_at_branch", "cancelled"] }).notNull(),
    driverName: text("driver_name"),
    driverPhone: text("driver_phone"),
    driverVehicleNo: text("driver_vehicle_no"),
    signatureR2Key: text("signature_r2_key"),
    signedManifestPhotoR2Key: text("signed_manifest_photo_r2_key"),
    scannedCount: integer("scanned_count").notNull().default(0),
    handedOverAt: integer("handed_over_at"),
    handedOverBy: text("handed_over_by"),
    suratJalanPdfR2Key: text("surat_jalan_pdf_r2_key"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("pickup_batches_one_open").on(t.courierCode).where(sql`status = 'open'`)],
)

export const pickupBatchItems = sqliteTable(
  "pickup_batch_items",
  {
    batchId: text("batch_id").notNull(),
    slug: text("slug").notNull(),
    scannedAt: integer("scanned_at").notNull(),
    scannedBy: text("scanned_by").notNull(),
    unpaidWarning: integer("unpaid_warning").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.slug] }), uniqueIndex("pickup_batch_items_slug").on(t.slug)],
)

// TASK-404 Meja Retur.
export const returnIntakes = sqliteTable(
  "return_intakes",
  {
    slug: text("slug").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    condition: text("condition", { enum: ["baik", "penyok_rusak", "terbuka"] }).notNull(),
    photoR2Key: text("photo_r2_key"),
    note: text("note"),
    intakeBy: text("intake_by").notNull(),
    intakeAt: integer("intake_at").notNull(),
    codeHash: text("code_hash"),
    codeSalt: text("code_salt"),
    codeIssuedAt: integer("code_issued_at"),
    codeAttempts: integer("code_attempts").notNull().default(0),
    codeLockedUntil: integer("code_locked_until"),
    storageDeadlineAt: integer("storage_deadline_at").notNull(),
    handbackAt: integer("handback_at"),
    handbackBy: text("handback_by"),
    handbackMethod: text("handback_method", { enum: ["code", "id_override"] }),
    handbackReason: text("handback_reason"),
    claimOffered: integer("claim_offered").notNull().default(0),
  },
  (t) => [index("return_intakes_open").on(t.handbackAt, t.intakeAt)],
)

// TASK-405 claims.
export const shipmentClaims = sqliteTable(
  "shipment_claims",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    shipmentSlug: text("shipment_slug").notNull(),
    kind: text("kind", { enum: ["rusak", "hilang", "isi_kurang"] }).notNull(),
    status: text("status", { enum: ["draft", "submitted", "approved", "rejected", "paid", "expired"] }).notNull(),
    deadlineAt: integer("deadline_at"),
    note: text("note"),
    evidenceJson: text("evidence_json").notNull().default("[]"),
    submittedAt: integer("submitted_at"),
    decidedAt: integer("decided_at"),
    paidInvoiceId: text("paid_invoice_id"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("shipment_claims_slug_kind").on(t.shipmentSlug, t.kind)],
)

// TASK-501 mini-site QR pre-booking and public tracking unlock attempts.
export const minisiteDrafts = sqliteTable(
  "minisite_drafts",
  {
    slug: text("slug").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    cod: integer("cod").notNull(),
    senderName: text("sender_name").notNull(),
    senderPhone: text("sender_phone").notNull(),
    senderStore: text("sender_store"),
    recipientName: text("recipient_name").notNull(),
    recipientPhone: text("recipient_phone").notNull(),
    recipientAreaId: text("recipient_area_id").notNull(),
    recipientAreaLabel: text("recipient_area_label"),
    recipientStreet: text("recipient_street").notNull(),
    content: text("content").notNull(),
    weightGram: integer("weight_gram").notNull(),
    codGoodsIdr: integer("cod_goods_idr").notNull().default(0),
    ipHash: text("ip_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    claimedAt: integer("claimed_at"),
    claimedBy: text("claimed_by"),
  },
  (t) => [index("minisite_drafts_expires").on(t.expiresAt)],
)

export const trackingUnlocks = sqliteTable("tracking_unlocks", {
  slug: text("slug").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: integer("locked_until"),
  updatedAt: integer("updated_at").notNull(),
})

// TASK-701 Layar Pelanggan (spec 03 §5): paired customer displays; the raw token is never stored.
export const customerDisplaySessions = sqliteTable(
  "customer_display_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    createdByUserId: text("created_by_user_id").notNull(),
    shiftId: text("shift_id"),
    stateJson: text("state_json").notNull(),
    stateUpdatedAt: integer("state_updated_at").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [index("customer_display_sessions_creator").on(t.createdByUserId).where(sql`revoked_at IS NULL`), index("customer_display_sessions_shift").on(t.shiftId).where(sql`shift_id IS NOT NULL`)],
)

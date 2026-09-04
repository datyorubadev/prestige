"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/icons";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Select, type SelectOption } from "@/components/ui/select";
import type { IndustryTemplate, TenantCustomTool, ToolParameter, ToolTestResult } from "@/lib/types";

const METHOD_OPTIONS: SelectOption[] = [
  { value: "GET", label: "GET — Fetch / Query Data" },
  { value: "POST", label: "POST — Create / Submit Action" },
  { value: "PUT", label: "PUT — Replace Resource" },
  { value: "PATCH", label: "PATCH — Update Resource" },
  { value: "DELETE", label: "DELETE — Remove Resource" },
];

const CATEGORY_OPTIONS: SelectOption[] = [
  { value: "fintech", label: "Fintech & Banking" },
  { value: "logistics", label: "Logistics & Shipping" },
  { value: "ecommerce", label: "E-Commerce & Retail" },
  { value: "healthcare", label: "Healthcare & Clinics" },
  { value: "telecom", label: "Telecom & Utilities" },
  { value: "saas", label: "CRM & SaaS Operations" },
  { value: "custom", label: "Custom Industry Action" },
];

const CATEGORY_ICONS: Record<string, IconName> = {
  fintech: "wallet",
  logistics: "send",
  ecommerce: "ticket",
  healthcare: "heart",
  telecom: "phone",
  saas: "code",
  kyc: "shield",
  doc_verify: "file",
  callbacks: "calendar",
  custom: "sparkles",
};

const DEFAULT_INDUSTRY_TEMPLATES: IndustryTemplate[] = [
  // --- FINTECH & BANKING ---
  {
    id: "tpl_fintech_txn",
    name: "lookup_transaction_status",
    displayName: "Verify Transaction Status",
    category: "fintech",
    description: "Look up real-time status, timestamp, amount, and settlement details for a transfer or payment using reference ID.",
    method: "GET",
    urlTemplate: "https://api.nairawave.ng/v1/transactions/{{reference}}",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "reference", type: "string", description: "Transaction reference or session ID (e.g. TXN-99420)", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "status, amount, beneficiary, timestamp",
  },
  {
    id: "tpl_fintech_bvn",
    name: "verify_bvn_identity",
    displayName: "Verify BVN / Identity Status",
    category: "fintech",
    description: "Verify customer KYC tier and Bank Verification Number status on file.",
    method: "POST",
    urlTemplate: "https://api.nairawave.ng/v1/kyc/bvn-lookup",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "account_number", type: "string", description: "10-digit NUBAN account number", required: true },
    ],
    bodyTemplate: "{\n  \"accountNumber\": \"{{account_number}}\"\n}",
    requiresApproval: true,
    responseExtractor: "kyc_tier, bvn_linked, status",
  },
  {
    id: "tpl_fintech_balance",
    name: "query_account_balance",
    displayName: "Query Account Ledger Balance",
    category: "fintech",
    description: "Securely look up ledger and available balance for a verified customer wallet.",
    method: "GET",
    urlTemplate: "https://api.nairawave.ng/v1/accounts/{{account_number}}/balance",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "account_number", type: "string", description: "10-digit NUBAN account number", required: true },
    ],
    requiresApproval: true,
    responseExtractor: "available_balance, ledger_balance, currency, tier",
  },
  {
    id: "tpl_fintech_freeze",
    name: "freeze_debit_card",
    displayName: "Temporary Card Freeze / Lock",
    category: "fintech",
    description: "Instantly freeze or lock a lost, stolen, or compromised debit card to prevent fraudulent charges.",
    method: "POST",
    urlTemplate: "https://api.nairawave.ng/v1/cards/{{card_id}}/freeze",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "card_id", type: "string", description: "Masked Card ID (e.g. CRD-8821)", required: true },
      { name: "reason", type: "string", description: "Customer stated reason (e.g. lost, stolen, suspicious)", required: true },
    ],
    bodyTemplate: "{\n  \"cardId\": \"{{card_id}}\",\n  \"reason\": \"{{reason}}\"\n}",
    requiresApproval: true,
    responseExtractor: "status, card_state, lock_timestamp",
  },

  // --- LOGISTICS & SHIPPING ---
  {
    id: "tpl_logistics_track",
    name: "track_shipment_waybill",
    displayName: "Track Logistics Waybill",
    category: "logistics",
    description: "Retrieve live tracking milestones, courier dispatcher location, and estimated delivery time for a waybill or package code.",
    method: "GET",
    urlTemplate: "https://api.speedaf.ng/v1/track/{{tracking_number}}",
    headers: { "Content-Type": "application/json" },
    parametersSchema: [
      { name: "tracking_number", type: "string", description: "Package waybill number (e.g. GIDI-992-ALERT)", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "status, location, estimated_delivery, dispatcher_phone",
  },
  {
    id: "tpl_logistics_reschedule",
    name: "reschedule_delivery",
    displayName: "Reschedule Package Delivery",
    category: "logistics",
    description: "Reschedule final-mile package delivery to a new target date and instructions.",
    method: "POST",
    urlTemplate: "https://api.speedaf.ng/v1/shipments/{{tracking_number}}/reschedule",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "tracking_number", type: "string", description: "Package tracking code", required: true },
      { name: "new_date", type: "string", description: "Target delivery date (YYYY-MM-DD)", required: true },
      { name: "instructions", type: "string", description: "Special delivery instructions", required: false },
    ],
    bodyTemplate: "{\n  \"newDate\": \"{{new_date}}\",\n  \"notes\": \"{{instructions}}\"\n}",
    requiresApproval: true,
    responseExtractor: "confirmed, new_delivery_window, status",
  },
  {
    id: "tpl_logistics_rate",
    name: "calculate_shipping_rate",
    displayName: "Calculate Waybill Shipping Quote",
    category: "logistics",
    description: "Calculate instant door-to-door courier cost and transit days based on weight and origin/destination cities.",
    method: "GET",
    urlTemplate: "https://api.speedaf.ng/v1/rates?from={{origin}}&to={{destination}}&weight_kg={{weight_kg}}",
    headers: { "Content-Type": "application/json" },
    parametersSchema: [
      { name: "origin", type: "string", description: "Pickup city (e.g. Lagos)", required: true },
      { name: "destination", type: "string", description: "Destination city (e.g. Abuja)", required: true },
      { name: "weight_kg", type: "string", description: "Weight in kilograms", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "rate_amount, currency, estimated_days, service_type",
  },

  // --- E-COMMERCE & RETAIL ---
  {
    id: "tpl_ecom_order",
    name: "lookup_order_status",
    displayName: "Check E-Commerce Order",
    category: "ecommerce",
    description: "Look up order items, payment status, tracking, and fulfillment progress.",
    method: "GET",
    urlTemplate: "https://api.store.com/v1/orders/{{order_id}}",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "order_id", type: "string", description: "Order number (e.g. ORD-10499)", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "order_status, items_count, total_amount, tracking_url",
  },
  {
    id: "tpl_ecom_cancel",
    name: "cancel_order",
    displayName: "Cancel Order & Process Refund",
    category: "ecommerce",
    description: "Cancel an unfulfilled order and trigger immediate refund to original payment method.",
    method: "POST",
    urlTemplate: "https://api.store.com/v1/orders/{{order_id}}/cancel",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "order_id", type: "string", description: "Order ID to cancel", required: true },
      { name: "reason", type: "string", description: "Cancellation reason from customer", required: true },
    ],
    bodyTemplate: "{\n  \"orderId\": \"{{order_id}}\",\n  \"reason\": \"{{reason}}\"\n}",
    requiresApproval: true,
    responseExtractor: "canceled, refund_reference, message",
  },
  {
    id: "tpl_ecom_stock",
    name: "check_product_inventory",
    displayName: "Check Product Stock & Sizes",
    category: "ecommerce",
    description: "Check real-time warehouse inventory, available sizes, and store pickup options for a SKU or product name.",
    method: "GET",
    urlTemplate: "https://api.store.com/v1/products/{{sku}}/inventory",
    headers: { "Content-Type": "application/json" },
    parametersSchema: [
      { name: "sku", type: "string", description: "Product SKU or item title (e.g. NIKE-AIR-42)", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "stock_quantity, in_stock, available_sizes, warehouse",
  },

  // --- HEALTHCARE & BOOKING ---
  {
    id: "tpl_health_slot",
    name: "check_appointment_slot",
    displayName: "Check Doctor Availability",
    category: "healthcare",
    description: "Check available consultation slots for a medical specialist or clinic department.",
    method: "GET",
    urlTemplate: "https://api.careclinic.ng/v1/appointments/available?dept={{department}}&date={{date}}",
    headers: { "Content-Type": "application/json" },
    parametersSchema: [
      { name: "department", type: "string", description: "Medical specialty (e.g. Pediatrics, Dental, Cardiology)", required: true },
      { name: "date", type: "string", description: "Date to inspect (YYYY-MM-DD)", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "slots, doctor_name, available_times",
  },
  {
    id: "tpl_health_book",
    name: "book_clinic_appointment",
    displayName: "Book Clinic Appointment",
    category: "healthcare",
    description: "Reserve an in-person or telehealth medical consultation for a patient.",
    method: "POST",
    urlTemplate: "https://api.careclinic.ng/v1/appointments/book",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "patient_id", type: "string", description: "Patient file or record number", required: true },
      { name: "doctor_id", type: "string", description: "Doctor or specialist ID", required: true },
      { name: "slot_time", type: "string", description: "Selected slot timestamp (ISO 8601)", required: true },
    ],
    bodyTemplate: "{\n  \"patientId\": \"{{patient_id}}\",\n  \"doctorId\": \"{{doctor_id}}\",\n  \"time\": \"{{slot_time}}\"\n}",
    requiresApproval: true,
    responseExtractor: "booking_id, status, confirmation_sms",
  },
  {
    id: "tpl_health_refill",
    name: "request_prescription_refill",
    displayName: "Prescription Medication Refill",
    category: "healthcare",
    description: "Submit a medication refill authorization request to the pharmacy dispensing department.",
    method: "POST",
    urlTemplate: "https://api.careclinic.ng/v1/pharmacy/refill",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "prescription_num", type: "string", description: "Prescription reference number", required: true },
      { name: "delivery_address", type: "string", description: "Patient delivery address", required: true },
    ],
    bodyTemplate: "{\n  \"rxNumber\": \"{{prescription_num}}\",\n  \"address\": \"{{delivery_address}}\"\n}",
    requiresApproval: true,
    responseExtractor: "refill_status, estimated_delivery, pharmacist_review",
  },

  // --- TELECOMS & UTILITIES ---
  {
    id: "tpl_telecom_data",
    name: "check_data_airtime_balance",
    displayName: "Check Data & Airtime Balance",
    category: "telecom",
    description: "Retrieve current mobile data quota, bonus bundle, and airtime balance for a phone number.",
    method: "GET",
    urlTemplate: "https://api.telco.ng/v1/subscribers/{{phone_number}}/balances",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "phone_number", type: "string", description: "Subscriber phone number (e.g. 08031234567)", required: true },
    ],
    requiresApproval: false,
    responseExtractor: "airtime_balance, data_mb_remaining, expiry_date, plan",
  },
  {
    id: "tpl_util_meter",
    name: "recharge_electricity_meter",
    displayName: "Recharge Prepaid Electricity Meter",
    category: "telecom",
    description: "Generate token recharge codes for Disco prepaid electricity meters.",
    method: "POST",
    urlTemplate: "https://api.utilities.ng/v1/power/recharge",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "meter_number", type: "string", description: "11-digit prepaid meter number", required: true },
      { name: "amount", type: "string", description: "Amount in Naira (e.g. 5000)", required: true },
    ],
    bodyTemplate: "{\n  \"meterNumber\": \"{{meter_number}}\",\n  \"amount\": \"{{amount}}\"\n}",
    requiresApproval: true,
    responseExtractor: "token_code, units_kwh, receipt_number",
  },

  // --- CRM & SAAS ---
  {
    id: "tpl_saas_apikey",
    name: "reset_developer_api_key",
    displayName: "Reset Developer API Key",
    category: "saas",
    description: "Generate a new developer secret key and invalidate the old credential.",
    method: "POST",
    urlTemplate: "https://api.platform.io/v1/orgs/{{org_id}}/api-keys/rotate",
    headers: { Authorization: "Bearer {{api_key}}", "Content-Type": "application/json" },
    parametersSchema: [
      { name: "org_id", type: "string", description: "Organization UUID", required: true },
    ],
    bodyTemplate: "{\n  \"orgId\": \"{{org_id}}\"\n}",
    requiresApproval: true,
    responseExtractor: "new_key_prefix, rotated_at, status",
  },
  {
    id: "tpl_saas_health",
    name: "query_system_service_health",
    displayName: "Check Platform Service Health",
    category: "saas",
    description: "Inspect live uptime status of platform clusters, payment gateways, and webhooks.",
    method: "GET",
    urlTemplate: "https://status.platform.io/api/v2/summary.json",
    headers: { "Content-Type": "application/json" },
    parametersSchema: [],
    requiresApproval: false,
    responseExtractor: "status_indicator, incident_count, last_updated",
  },

  // --- KYC VERIFICATION ---
  {
    id: "tpl_kyc_banking",
    name: "kyc_bank_account_verification",
    displayName: "Bank Account KYC Verification",
    category: "kyc",
    description: "Verify customer identity against uploaded bank records. Quizzes the customer on protected fields before granting access.",
    toolType: "kyc",
    method: "POST",
    urlTemplate: "",
    headers: {},
    parametersSchema: [],
    requiresApproval: false,
    config: {
      lookupKey: "account_number",
      quizFields: ["full_name", "date_of_birth", "phone_number"],
      protectedFields: ["account_number", "balance", "account_type", "bvn_status"],
      passingScore: 70,
      maxAttempts: 3,
    },
  },
  {
    id: "tpl_kyc_telco",
    name: "kyc_telco_subscriber",
    displayName: "Telco Subscriber KYC Verification",
    category: "kyc",
    description: "Verify telecom subscriber identity by quiz on account details before revealing sensitive plan or billing data.",
    toolType: "kyc",
    method: "POST",
    urlTemplate: "",
    headers: {},
    parametersSchema: [],
    requiresApproval: false,
    config: {
      lookupKey: "phone_number",
      quizFields: ["full_name", "date_of_birth", "address"],
      protectedFields: ["phone_number", "sim_serial", "plan_name", "monthly_usage"],
      passingScore: 75,
      maxAttempts: 3,
    },
  },

  // --- DOCUMENT VERIFICATION ---
  {
    id: "tpl_doc_id",
    name: "verify_government_id",
    displayName: "Government ID Document Verification",
    category: "doc_verify",
    description: "Verify a government-issued ID document (national ID, driver's license, passport) against uploaded templates and match rules.",
    toolType: "doc_verify",
    method: "POST",
    urlTemplate: "",
    headers: {},
    parametersSchema: [],
    requiresApproval: false,
    config: {
      acceptedTypes: ["National ID", "Driver's License", "Passint ID"],
      matchFields: {
        "National ID": ["full_name", "date_of_birth", "id_number"],
        "Driver's License": ["full_name", "date_of_birth", "license_number", "expiry_date"],
        "Passport": ["full_name", "nationality", "passport_number", "date_of_birth"],
      },
    },
  },
  {
    id: "tpl_doc_utility",
    name: "verify_utility_bill",
    displayName: "Utility Bill Verification",
    category: "doc_verify",
    description: "Verify utility bill documents for address confirmation. Matches customer-provided details against uploaded bill records.",
    toolType: "doc_verify",
    method: "POST",
    urlTemplate: "",
    headers: {},
    parametersSchema: [],
    requiresApproval: false,
    config: {
      acceptedTypes: ["Electricity Bill", "Water Bill", "Internet Bill"],
      matchFields: {
        "Electricity Bill": ["account_holder", "address", "account_number"],
        "Water Bill": ["account_holder", "address", "meter_number"],
        "Internet Bill": ["account_holder", "address", "service_id"],
      },
    },
  },

  // --- CALLBACK SCHEDULER ---
  {
    id: "tpl_callback_general",
    name: "schedule_general_callback",
    displayName: "General Callback Scheduler",
    category: "callbacks",
    description: "Schedule a callback with the next available agent. Customer selects a preferred time slot and provides a reason.",
    toolType: "callback",
    method: "POST",
    urlTemplate: "",
    headers: {},
    parametersSchema: [],
    requiresApproval: false,
    config: {
      serviceTypes: ["General Inquiry", "Technical Support", "Billing Question"],
      advanceDays: 7,
      bufferMinutes: 15,
      confirmationTemplate: "Your callback has been scheduled for {{date}} at {{time}}. A {{service_type}} agent will call you at {{phone_number}}. Reference: {{booking_id}}.",
    },
  },
  {
    id: "tpl_callback_sales",
    name: "schedule_sales_demo",
    displayName: "Sales Demo Callback Scheduler",
    category: "callbacks",
    description: "Let prospective customers book a sales demo call with the account executive team.",
    toolType: "callback",
    method: "POST",
    urlTemplate: "",
    headers: {},
    parametersSchema: [],
    requiresApproval: false,
    config: {
      serviceTypes: ["Product Demo", "Pricing Discussion", "Enterprise Onboarding"],
      advanceDays: 14,
      bufferMinutes: 30,
      confirmationTemplate: "Your {{service_type}} call is confirmed for {{date}} at {{time}}. Our team will reach out to {{phone_number}}. Booking ref: {{booking_id}}.",
    },
  },
];

export interface KYCDataSourceItem {
  id: string;
  name: string;
  filename: string;
  rowCount: number;
  columns: string[];
  lookupKey: string;
  createdAt?: string;
}

export function AiToolsTab() {
  const toast = useToast();
  const [tools, setTools] = useState<TenantCustomTool[]>([]);
  const [templates, setTemplates] = useState<IndustryTemplate[]>(DEFAULT_INDUSTRY_TEMPLATES);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<"tools" | "datasets">("tools");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [templateCategory, setTemplateCategory] = useState<string>("all");
  const [templateSearch, setTemplateSearch] = useState("");

  // Visual Builder Modal state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<TenantCustomTool | null>(null);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);

  // Form State
  const [formName, setFormName] = useState("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formCategory, setFormCategory] = useState("fintech");
  const [formDescription, setFormDescription] = useState("");
  const [formMethod, setFormMethod] = useState("GET");
  const [formUrl, setFormUrl] = useState("");
  const [formHeaders, setFormHeaders] = useState<Array<{ key: string; value: string }>>([
    { key: "Content-Type", value: "application/json" },
  ]);
  const [formParams, setFormParams] = useState<ToolParameter[]>([]);
  const [formBodyTemplate, setFormBodyTemplate] = useState("");
  const [formResponseExtractor, setFormResponseExtractor] = useState("");
  const [formRequiresApproval, setFormRequiresApproval] = useState(false);

  // Tool Type & Type-Specific Config
  const [formToolType, setFormToolType] = useState<"api" | "kyc" | "doc_verify" | "callback">("api");
  const [formConfig, setFormConfig] = useState<Record<string, unknown>>({});

  // KYC-specific state
  const [kycDataSources, setKycDataSources] = useState<KYCDataSourceItem[]>([]);
  const [kycQuizFields, setKycQuizFields] = useState<string[]>(["full_name", "date_of_birth", "phone_number"]);
  const [kycProtectedFields, setKycProtectedFields] = useState<string[]>(["balance", "account_type"]);
  const [kycPassingScore, setKycPassingScore] = useState(60);
  const [kycReferralMessage, setKycReferralMessage] = useState("I'll need to refer you to our office for verification.");
  const [kycUploadFile, setKycUploadFile] = useState<File | null>(null);
  const [kycUploadName, setKycUploadName] = useState("");
  const [kycUploadLookupKey, setKycUploadLookupKey] = useState("account_number");
  const [kycUploading, setKycUploading] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [detectedRowCount, setDetectedRowCount] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  // Dataset Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewDataSource, setPreviewDataSource] = useState<KYCDataSourceItem | null>(null);
  const [previewRecords, setPreviewRecords] = useState<Array<{ id: string; lookupValue: string; data: Record<string, unknown> }>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewTotal, setPreviewTotal] = useState(0);

  // Standalone Upload Modal state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Doc Verify-specific state
  const [docAcceptedTypes, setDocAcceptedTypes] = useState<string[]>(["national_id", "passport", "drivers_license"]);
  const [docMatchFields, setDocMatchFields] = useState<Record<string, string[]>>({
    national_id: ["full_name", "date_of_birth"],
    passport: ["full_name", "nationality"],
    drivers_license: ["full_name", "date_of_birth"],
  });
  const [docVerificationMsg, setDocVerificationMsg] = useState("Your identity has been verified successfully.");
  const [docFailureMsg, setDocFailureMsg] = useState("I couldn't verify your identity. Please visit our office with a valid ID.");

  // Callback-specific state
  const [callbackSlots, setCallbackSlots] = useState<Array<{ day: string; start: string; end: string }>>([
    { day: "monday", start: "09:00", end: "17:00" },
    { day: "tuesday", start: "09:00", end: "17:00" },
    { day: "wednesday", start: "09:00", end: "17:00" },
    { day: "thursday", start: "09:00", end: "17:00" },
    { day: "friday", start: "09:00", end: "17:00" },
  ]);
  const [callbackServiceTypes, setCallbackServiceTypes] = useState<string[]>(["general_inquiry", "technical_support", "billing"]);
  const [callbackAgents, setCallbackAgents] = useState<string[]>([]);
  const [callbackBufferMinutes, setCallbackBufferMinutes] = useState(15);
  const [callbackMaxAdvanceDays, setCallbackMaxAdvanceDays] = useState(14);
  const [callbackConfirmationMsg, setCallbackConfirmationMsg] = useState("Your callback is confirmed for {date} at {time}. We'll call you at {phone}.");

  // Live Test Sandbox state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testingTool, setTestingTool] = useState<TenantCustomTool | null>(null);
  const [testArgs, setTestArgs] = useState<Record<string, string>>({});
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<ToolTestResult | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [toolsRes, templatesRes] = await Promise.all([
        api.get<{ tools: TenantCustomTool[] }>("/ai/tools").catch(() => ({ tools: [] })),
        api.get<{ templates: IndustryTemplate[] }>("/ai/tools/templates").catch(() => ({ templates: [] })),
      ]);
      setTools(toolsRes?.tools || []);
      if (templatesRes?.templates && templatesRes.templates.length > 0) {
        setTemplates(templatesRes.templates);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => void loadData());
    return () => cancelAnimationFrame(id);
  }, [loadData]);

  const openNewTool = () => {
    setEditingTool(null);
    setFormName("");
    setFormDisplayName("");
    setFormCategory("fintech");
    setFormDescription("");
    setFormMethod("GET");
    setFormUrl("");
    setFormHeaders([{ key: "Content-Type", value: "application/json" }]);
    setFormParams([]);
    setFormBodyTemplate("");
    setFormResponseExtractor("");
    setFormRequiresApproval(false);
    setFormToolType("api");
    setFormConfig({});
    setKycQuizFields(["full_name", "date_of_birth", "phone_number"]);
    setKycProtectedFields(["balance", "account_type"]);
    setKycPassingScore(60);
    setKycReferralMessage("I'll need to refer you to our office for verification.");
    setKycUploadFile(null);
    setKycUploadName("");
    setKycUploadLookupKey("account_number");
    setDetectedColumns([]);
    setDetectedRowCount(0);
    setDocAcceptedTypes(["national_id", "passport", "drivers_license"]);
    setDocMatchFields({ national_id: ["full_name", "date_of_birth"], passport: ["full_name", "nationality"], drivers_license: ["full_name", "date_of_birth"] });
    setDocVerificationMsg("Your identity has been verified successfully.");
    setDocFailureMsg("I couldn't verify your identity. Please visit our office with a valid ID.");
    setCallbackSlots([
      { day: "monday", start: "09:00", end: "17:00" },
      { day: "tuesday", start: "09:00", end: "17:00" },
      { day: "wednesday", start: "09:00", end: "17:00" },
      { day: "thursday", start: "09:00", end: "17:00" },
      { day: "friday", start: "09:00", end: "17:00" },
    ]);
    setCallbackServiceTypes(["general_inquiry", "technical_support", "billing"]);
    setCallbackAgents([]);
    setCallbackBufferMinutes(15);
    setCallbackMaxAdvanceDays(14);
    setCallbackConfirmationMsg("Your callback is confirmed for {date} at {time}. We'll call you at {phone}.");
    setWizardStep(1);
    setBuilderOpen(true);
  };

  // Auto-open the Visual Action Builder when the page is reached via a deep
  // link (e.g. "Add Action / Tool" from the Autonomy Matrix) with ?builder=1.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("builder") === "1") {
      const id = requestAnimationFrame(() => {
        openNewTool();
        window.history.replaceState({}, "", window.location.pathname);
      });
      return () => cancelAnimationFrame(id);
    }
  }, []);

  const openEditTool = (tool: TenantCustomTool) => {
    setEditingTool(tool);
    setFormName(tool.name);
    setFormDisplayName(tool.displayName);
    setFormCategory(tool.category);
    setFormDescription(tool.description);
    setFormMethod(tool.method);
    setFormUrl(tool.urlTemplate);
    const headersList = Object.entries(tool.headers || {}).map(([key, value]) => ({ key, value }));
    setFormHeaders(headersList.length ? headersList : [{ key: "Content-Type", value: "application/json" }]);
    setFormParams(tool.parametersSchema || []);
    setFormBodyTemplate(tool.bodyTemplate || "");
    setFormResponseExtractor(tool.responseExtractor || "");
    setFormRequiresApproval(tool.requiresApproval);
    setFormToolType(tool.toolType || "api");
    const cfg = tool.config || {};
    setFormConfig(cfg);
    // Load type-specific config from the config object
    if (tool.toolType === "kyc") {
      setFormConfig({
        dataSourceId: (cfg as Record<string, unknown>).dataSourceId,
        lookupKey: (cfg as Record<string, unknown>).lookupKey,
      });
      setKycQuizFields((cfg as Record<string, unknown>).quizFields as string[] || ["full_name", "date_of_birth", "phone_number"]);
      setKycProtectedFields((cfg as Record<string, unknown>).protectedFields as string[] || ["balance", "account_type"]);
      setKycPassingScore(((cfg as Record<string, unknown>).passingScore as number || 0.6) * 100);
      setKycReferralMessage((cfg as Record<string, unknown>).referralMessage as string || "");
    } else if (tool.toolType === "doc_verify") {
      const accepted = (cfg as Record<string, unknown>).accepted_types as string[] || [];
      const fields = (cfg as Record<string, unknown>).match_fields as Record<string, string[]> || {};
      setDocAcceptedTypes(accepted.length ? accepted : ["national_id", "passport"]);
      setDocMatchFields(Object.keys(fields).length ? fields : { national_id: ["full_name", "date_of_birth"] });
      setDocVerificationMsg((cfg as Record<string, unknown>).verification_message as string || "");
      setDocFailureMsg((cfg as Record<string, unknown>).failure_message as string || "");
    } else if (tool.toolType === "callback") {
      const slots = (cfg as Record<string, unknown>).available_slots as Array<{ day: string; start: string; end: string }> || [];
      setCallbackSlots(slots.length ? slots : [{ day: "monday", start: "09:00", end: "17:00" }]);
      setCallbackServiceTypes((cfg as Record<string, unknown>).service_types as string[] || ["general_inquiry"]);
      setCallbackAgents((cfg as Record<string, unknown>).agents as string[] || []);
      setCallbackBufferMinutes((cfg as Record<string, unknown>).buffer_minutes as number || 15);
      setCallbackMaxAdvanceDays((cfg as Record<string, unknown>).max_advance_days as number || 14);
      setCallbackConfirmationMsg((cfg as Record<string, unknown>).confirmation_message as string || "");
    }
    setWizardStep(1);
    setBuilderOpen(true);
  };

  const installTemplate = async (tpl: IndustryTemplate) => {
    try {
      await api.post("/ai/tools", {
        name: tpl.name,
        displayName: tpl.displayName,
        description: tpl.description,
        category: tpl.category,
        toolType: tpl.toolType || "api",
        method: tpl.method,
        urlTemplate: tpl.urlTemplate,
        headers: tpl.headers,
        parametersSchema: tpl.parametersSchema,
        bodyTemplate: tpl.bodyTemplate,
        responseExtractor: tpl.responseExtractor,
        requiresApproval: tpl.requiresApproval,
        config: tpl.config || {},
        isActive: true,
      });
      toast(`Installed "${tpl.displayName}" tool template successfully!`);
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to install template", "danger");
    }
  };

  const toggleTool = async (tool: TenantCustomTool) => {
    try {
      await api.post(`/ai/tools/${tool.id}/toggle`, {});
      setTools((prev) =>
        prev.map((t) => (t.id === tool.id ? { ...t, isActive: !t.isActive } : t)),
      );
      toast(`Tool "${tool.displayName}" ${tool.isActive ? "disabled" : "enabled"}`);
    } catch {
      toast("Could not toggle tool status", "danger");
    }
  };

  const deleteTool = async (tool: TenantCustomTool) => {
    if (!window.confirm(`Delete tool "${tool.displayName}"?`)) return;
    try {
      await api.del(`/ai/tools/${tool.id}`);
      setTools((prev) => prev.filter((t) => t.id !== tool.id));
      toast(`Tool "${tool.displayName}" deleted`);
    } catch {
      toast("Could not delete tool", "danger");
    }
  };

  const saveTool = async () => {
    if (!formName.trim() || !formDescription.trim()) {
      toast("Please fill in all required fields (Name, Description)", "danger");
      return;
    }
    if (formToolType === "api" && !formUrl.trim()) {
      toast("API tools require a URL template", "danger");
      return;
    }
    setSaving(true);
    const headersObj: Record<string, string> = {};
    formHeaders.forEach((h) => {
      if (h.key.trim()) headersObj[h.key.trim()] = h.value;
    });

    // Build type-specific config
    let typeConfig: Record<string, unknown> = {};
    if (formToolType === "kyc") {
      const dsId = (formConfig as Record<string, unknown>).dataSourceId as string | undefined;
      if (!dsId) {
        toast("Please link a customer dataset in Step 2 before saving", "danger");
        setSaving(false);
        return;
      }
      const linkedDs = kycDataSources.find((d) => d.id === dsId);
      typeConfig = {
        dataSourceId: dsId,
        lookupKey: (formConfig as Record<string, unknown>).lookupKey || linkedDs?.lookupKey || kycUploadLookupKey,
        quizFields: kycQuizFields,
        protectedFields: kycProtectedFields,
        passingScore: kycPassingScore / 100,
        totalQuestions: kycQuizFields.length,
        referralMessage: kycReferralMessage,
      };
    } else if (formToolType === "doc_verify") {
      typeConfig = {
        accepted_types: docAcceptedTypes,
        match_fields: docMatchFields,
        verification_message: docVerificationMsg,
        failure_message: docFailureMsg,
      };
    } else if (formToolType === "callback") {
      typeConfig = {
        available_slots: callbackSlots,
        service_types: callbackServiceTypes,
        agents: callbackAgents,
        buffer_minutes: callbackBufferMinutes,
        max_advance_days: callbackMaxAdvanceDays,
        confirmation_message: callbackConfirmationMsg,
      };
    }

    const payload = {
      name: formName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
      displayName: formDisplayName.trim() || formName.trim(),
      description: formDescription.trim(),
      category: formCategory,
      toolType: formToolType,
      config: typeConfig,
      method: formMethod,
      urlTemplate: formToolType === "api" ? formUrl.trim() : "",
      headers: headersObj,
      parametersSchema: formParams,
      bodyTemplate: formBodyTemplate.trim() || null,
      responseExtractor: formResponseExtractor.trim() || null,
      requiresApproval: formRequiresApproval,
      isActive: true,
    };

    try {
      if (editingTool) {
        await api.patch(`/ai/tools/${editingTool.id}`, payload);
        toast(`Tool "${payload.displayName}" updated successfully!`);
      } else {
        await api.post("/ai/tools", payload);
        toast(`Tool "${payload.displayName}" registered successfully!`);
      }
      setBuilderOpen(false);
      await loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save tool", "danger");
    } finally {
      setSaving(false);
    }
  };

  const openTestSandbox = (tool: TenantCustomTool) => {
    setTestingTool(tool);
    const initialArgs: Record<string, string> = {};
    (tool.parametersSchema || []).forEach((p) => {
      initialArgs[p.name] = "";
    });
    setTestArgs(initialArgs);
    setTestResult(null);
    setTestModalOpen(true);
  };

  const runTest = async () => {
    if (!testingTool) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await api.post<ToolTestResult>("/ai/tools/test", {
        toolId: testingTool.id,
        method: testingTool.method,
        urlTemplate: testingTool.urlTemplate,
        headers: testingTool.headers,
        bodyTemplate: testingTool.bodyTemplate,
        testArgs,
      });
      setTestResult(res);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test request failed", "danger");
    } finally {
      setTestRunning(false);
    }
  };

  const loadKycDataSources = useCallback(async () => {
    try {
      const res = await api.get<{ dataSources: KYCDataSourceItem[] }>("/verification/kyc/datasources");
      setKycDataSources(res?.dataSources || []);
    } catch { /* graceful */ }
  }, []);

  useEffect(() => {
    void loadKycDataSources();
  }, [loadKycDataSources]);

  const handleFileSelect = (file: File) => {
    setKycUploadFile(file);
    const cleanName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    if (!kycUploadName.trim()) {
      setKycUploadName(cleanName);
    }
    if (file.name.toLowerCase().endsWith(".csv")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = (e.target?.result as string) || "";
        const lines = text.split(/\r?\n/).filter(Boolean);
        if (lines.length > 0) {
          const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
          setDetectedColumns(headers);
          setDetectedRowCount(Math.max(0, lines.length - 1));
          const candidates = ["account_number", "email", "phone_number", "phone", "bvn", "nin"];
          const matched = candidates.find((c) => headers.map((h) => h.toLowerCase()).includes(c));
          if (matched) {
            const actual = headers.find((h) => h.toLowerCase() === matched);
            if (actual) setKycUploadLookupKey(actual);
          } else if (headers.length > 0) {
            setKycUploadLookupKey(headers[0]);
          }
        }
      };
      reader.readAsText(file.slice(0, 8192));
    }
  };

  const uploadKycFile = async () => {
    if (!kycUploadFile) {
      toast("Please choose a CSV or Excel file", "danger");
      return;
    }
    setKycUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", kycUploadFile);
      const params = new URLSearchParams();
      if (kycUploadName.trim()) params.set("name", kycUploadName.trim());
      if (kycUploadLookupKey.trim()) params.set("lookup_key", kycUploadLookupKey.trim());
      const res = await api.post<KYCDataSourceItem>(
        `/verification/kyc/upload?${params.toString()}`,
        fd,
      );
      setKycDataSources((prev) => [res, ...prev.filter((d) => d.id !== res.id)]);
      setFormConfig((prev) => ({ ...prev, dataSourceId: res.id, lookupKey: res.lookupKey }));
      setKycUploadFile(null);
      setKycUploadName("");
      setDetectedColumns([]);
      setDetectedRowCount(0);
      setUploadModalOpen(false);
      toast(`Uploaded ${res.rowCount} records from "${res.name}" successfully!`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed", "danger");
    } finally {
      setKycUploading(false);
    }
  };

  const deleteKycDataSource = async (dsId: string, dsName: string) => {
    if (!window.confirm(`Delete dataset "${dsName}"?`)) return;
    try {
      await api.delete(`/verification/kyc/datasources/${dsId}`);
      setKycDataSources((prev) => prev.filter((d) => d.id !== dsId));
      if ((formConfig as Record<string, unknown>).dataSourceId === dsId) {
        setFormConfig((prev) => {
          const next = { ...prev };
          delete next.dataSourceId;
          return next;
        });
      }
      toast(`Dataset "${dsName}" deleted`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete dataset", "danger");
    }
  };

  const loadPreviewRecords = async (dsId: string, page = 1) => {
    setPreviewLoading(true);
    try {
      const res = await api.get<{
        records: Array<{ id: string; lookupValue: string; data: Record<string, unknown> }>;
        total: number;
        page: number;
      }>(`/verification/kyc/datasources/${dsId}/records?pageSize=20&page=${page}`);
      setPreviewRecords(res?.records || []);
      setPreviewTotal(res?.total || 0);
      setPreviewPage(res?.page || 1);
    } catch {
      toast("Could not load preview records", "danger");
    } finally {
      setPreviewLoading(false);
    }
  };

  const openPreviewModal = (ds: KYCDataSourceItem) => {
    setPreviewDataSource(ds);
    setPreviewModalOpen(true);
    void loadPreviewRecords(ds.id, 1);
  };

  const createToolFromDataSource = (ds: KYCDataSourceItem) => {
    openNewTool();
    setFormToolType("kyc");
    setFormDisplayName(`${ds.name} Verification`);
    setFormName(`kyc_${ds.name.toLowerCase().replace(/[^a-z0-9_]+/g, "_")}`);
    setFormDescription(`Verify customer identity against ${ds.name} (${ds.rowCount} records) before revealing protected account details or performing sensitive actions.`);
    setFormConfig({ dataSourceId: ds.id, lookupKey: ds.lookupKey });
    const cols = ds.columns || [];
    const quizCandidates = ["full_name", "date_of_birth", "phone_number", "mother_maiden_name", "state_of_origin", "address"];
    const protectedCandidates = ["balance", "account_type", "bvn_status", "kyc_tier", "bvn", "nin"];
    const matchedQuiz = cols.filter((c) => quizCandidates.includes(c.toLowerCase()));
    const matchedProtected = cols.filter((c) => protectedCandidates.includes(c.toLowerCase()));
    if (matchedQuiz.length) setKycQuizFields(matchedQuiz);
    if (matchedProtected.length) setKycProtectedFields(matchedProtected);
    setWizardStep(2);
  };

  const TOOL_TYPE_OPTIONS = [
    { value: "api", label: "API Action", icon: "send" as IconName, color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20", desc: "Connect any REST API endpoint. The AI calls your webhook when needed." },
    { value: "kyc", label: "KYC Verification", icon: "shield" as IconName, color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20", desc: "Verify customer identity by quizzing them against uploaded data. Pass once, access all protected fields." },
    { value: "doc_verify", label: "Document Verification", icon: "file" as IconName, color: "text-violet-500", bg: "bg-violet-500/10 border-violet-500/20", desc: "Validate customer documents (ID, passport, license) by matching provided fields." },
    { value: "callback", label: "Callback Scheduler", icon: "calendar" as IconName, color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20", desc: "Let customers book callback appointments from available time slots." },
  ];

  const filteredTools = useMemo(() => {
    if (activeCategory === "all") return tools;
    return tools.filter((t) => t.category.toLowerCase() === activeCategory.toLowerCase());
  }, [tools, activeCategory]);

  const filteredTemplates = useMemo(() => {
    let list = templates;
    if (templateCategory !== "all") {
      list = list.filter((t) => t.category.toLowerCase() === templateCategory.toLowerCase());
    }
    if (templateSearch.trim()) {
      const q = templateSearch.toLowerCase();
      list = list.filter(
        (t) =>
          t.displayName.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q),
      );
    }
    return list;
  }, [templates, templateCategory, templateSearch]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length };
    templates.forEach((t) => {
      counts[t.category] = (counts[t.category] || 0) + 1;
    });
    return counts;
  }, [templates]);

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5 shadow-xs">
        <div>
          <h2 className="text-h2 text-text font-bold">AI Actions & Verification Tools</h2>
          <p className="mt-1 text-[13px] text-text-3">
            Connect REST APIs, verify customer identity (KYC), validate documents, or schedule callbacks — all powered by your AI assistant.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-500/10 dark:bg-emerald-500/15 dark:border-emerald-500/30 px-3.5 py-2 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/25 transition-colors duration-150 shadow-xs"
          >
            <Icon name="upload" size={15} className="shrink-0" />
            Upload Customer Data
          </button>
          <button
            type="button"
            onClick={openNewTool}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors duration-150 hover:bg-primary-dark shadow-sm"
          >
            <Icon name="plus" size={15} />
            Create New Tool
          </button>
        </div>
      </div>

      {/* Primary View Switcher Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setMainTab("tools")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all ${
            mainTab === "tools"
              ? "bg-primary text-white shadow-xs"
              : "bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text border border-border"
          }`}
        >
          <Icon name="sparkles" size={15} />
          <span>AI Actions & Tools</span>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${mainTab === "tools" ? "bg-white/20 text-white" : "bg-surface-3 text-text-3"}`}>
            {tools.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMainTab("datasets")}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all ${
            mainTab === "datasets"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text border border-border"
          }`}
        >
          <Icon name="shield" size={15} />
          <span>KYC Customer Datasets</span>
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${mainTab === "datasets" ? "bg-white/20 text-white" : "bg-surface-3 text-text-3"}`}>
            {kycDataSources.length}
          </span>
        </button>
      </div>

      {mainTab === "tools" && (
        <>
      {/* Preconfigured Industry Templates 1-Click Install Gallery */}
      <Card title="Industry Action Templates (1-Click Install)" icon="sparkles">
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-text-3">
            Production-grade integration actions with validated parameter schemas, endpoint templates, and security gates. Click Install to instantly equip your AI Agent.
          </p>

          {/* Filter Toolbar: Category Tabs + Search */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
              {[
                { id: "all", label: "All Actions" },
                { id: "fintech", label: "Fintech & Banking" },
                { id: "logistics", label: "Logistics & Shipping" },
                { id: "ecommerce", label: "E-Commerce & Retail" },
                { id: "healthcare", label: "Healthcare & Booking" },
                { id: "telecom", label: "Telecom & Utilities" },
                { id: "saas", label: "CRM & SaaS" },
                { id: "kyc", label: "KYC Verification" },
                { id: "doc_verify", label: "Document Verification" },
                { id: "callbacks", label: "Callback Scheduling" },
              ].map((tab) => {
                const count = tab.id === "all" ? templates.length : (categoryCounts[tab.id] || 0);
                const isActive = templateCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTemplateCategory(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      isActive
                        ? "bg-primary text-white shadow-xs"
                        : "bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text border border-border/40"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        isActive ? "bg-white/20 text-white" : "bg-surface-3 text-text-3"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12.5px] text-text">
              <Icon name="search" size={14} className="text-text-3" />
              <input
                type="text"
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                placeholder="Search templates..."
                className="w-40 bg-transparent text-[12px] placeholder:text-text-3 focus:outline-none"
              />
              {templateSearch && (
                <button
                  type="button"
                  onClick={() => setTemplateSearch("")}
                  className="text-text-3 hover:text-text"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((tpl) => {
              const alreadyInstalled = tools.some((t) => t.name === tpl.name);
              return (
                <div
                  key={tpl.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-[#f6f6f6] p-4 transition-all hover:border-primary-border hover:shadow-card group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[11px] font-semibold uppercase text-text-3">
                        <Icon name={CATEGORY_ICONS[tpl.category] || "sparkles"} size={12} className="text-primary" />
                        {tpl.toolType && tpl.toolType !== "api" ? (
                          <span className={`rounded px-1 py-0 text-[10px] font-bold ${
                            tpl.toolType === "kyc" ? "bg-emerald-500/10 text-emerald-600" :
                            tpl.toolType === "doc_verify" ? "bg-violet-500/10 text-violet-600" :
                            "bg-amber-500/10 text-amber-600"
                          }`}>
                            {tpl.toolType === "kyc" ? "KYC" : tpl.toolType === "doc_verify" ? "DOC VERIFY" : "CALLBACK"}
                          </span>
                        ) : tpl.category}
                      </span>
                      {tpl.requiresApproval ? (
                        <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          HITL Approval
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Autonomous
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2.5 text-[13.5px] font-bold text-text group-hover:text-primary transition-colors">
                      {tpl.displayName}
                    </h4>
                    <p className="mt-1 text-[12px] text-text-3 leading-relaxed line-clamp-2">{tpl.description}</p>
                    {tpl.toolType && tpl.toolType !== "api" ? (
                      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-text-3 bg-surface p-1.5 rounded-md border border-border/40">
                        <Icon name={tpl.toolType === "kyc" ? "shield" : tpl.toolType === "doc_verify" ? "file" : "calendar"} size={12} className="text-primary" />
                        <span className="font-semibold">
                          {tpl.toolType === "kyc" ? "Identity Verification Flow" : tpl.toolType === "doc_verify" ? "Document Match & Verify" : "Callback Booking Flow"}
                        </span>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-text-3 bg-surface p-1.5 rounded-md border border-border/40 truncate">
                        <span className="font-bold text-primary">{tpl.method}</span>
                        <span className="truncate">{tpl.urlTemplate}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                    <span className="text-[11px] text-text-3 font-medium">
                      {tpl.parametersSchema.length} parameter{tpl.parametersSchema.length === 1 ? "" : "s"}
                    </span>
                    <button
                      type="button"
                      disabled={alreadyInstalled}
                      onClick={() => installTemplate(tpl)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-surface border border-border px-3 py-1.5 text-[11.5px] font-semibold text-text hover:bg-primary hover:text-white hover:border-primary disabled:opacity-60 transition-all shadow-xs"
                    >
                      {alreadyInstalled ? <Icon name="check" size={13} className="text-success" /> : <Icon name="plus" size={13} />}
                      {alreadyInstalled ? "Installed" : tpl.toolType && tpl.toolType !== "api" ? `Install ${tpl.toolType === "kyc" ? "KYC" : tpl.toolType === "doc_verify" ? "Doc Verify" : "Callback"} Tool` : "Install Action"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Installed Tools Management Table */}
      <Card title="Active Workspace Tools" icon="wrench">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border pb-3 mb-4">
          {[
            { id: "all", label: "All Active Tools" },
            { id: "fintech", label: "Fintech" },
            { id: "logistics", label: "Logistics" },
            { id: "ecommerce", label: "E-Commerce" },
            { id: "healthcare", label: "Healthcare" },
            { id: "telecom", label: "Telecom" },
            { id: "saas", label: "SaaS" },
            { id: "kyc", label: "KYC" },
            { id: "doc_verify", label: "Doc Verify" },
            { id: "callbacks", label: "Callbacks" },
            { id: "custom", label: "Custom" },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-lg px-3 py-1 text-[12px] font-semibold capitalize transition-colors ${
                activeCategory === cat.id
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text border border-border/40"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size={24} />
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-text-3">
              <Icon name="wrench" size={24} />
            </span>
            <p className="mt-3 text-[13.5px] font-bold text-text">No custom tools configured yet</p>
            <p className="mt-1 max-w-sm text-[12px] text-text-3">
              Install a pre-built industry template above or click Create Custom Action to connect your own REST APIs.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="border-b border-border bg-surface-2/60 text-text-2 font-medium uppercase text-[12px] tracking-wide">
                <tr>
                  <th className="px-4 py-2.5 select-none">Status</th>
                  <th className="px-4 py-2.5 select-none">Tool Name</th>
                  <th className="px-4 py-2.5 select-none">Type</th>
                  <th className="px-4 py-2.5 select-none">Details</th>
                  <th className="px-4 py-2.5 select-none">Executions</th>
                  <th className="px-4 py-2.5 select-none text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredTools.map((tool) => (
                  <tr key={tool.id} className="group transition-colors hover:bg-surface-2">
                    <td className="py-3">
                      <Switch
                        checked={tool.isActive}
                        onChange={() => toggleTool(tool)}
                        label={tool.isActive ? "Active" : "Disabled"}
                      />
                    </td>
                    <td className="py-3">
                      <div>
                        <p className="font-bold text-text">{tool.displayName}</p>
                        <p className="font-mono text-[11px] text-text-3">{tool.name}</p>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${
                        (tool.toolType || "api") === "kyc" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                        (tool.toolType || "api") === "doc_verify" ? "bg-violet-500/10 text-violet-600 border-violet-500/20" :
                        (tool.toolType || "api") === "callback" ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                        "bg-blue-500/10 text-blue-600 border-blue-500/20"
                      }`}>
                        <Icon name={
                          (tool.toolType || "api") === "kyc" ? "shield" :
                          (tool.toolType || "api") === "doc_verify" ? "file" :
                          (tool.toolType || "api") === "callback" ? "calendar" : "send"
                        } size={11} />
                        {(tool.toolType || "api") === "api" ? "API" :
                         (tool.toolType || "api") === "kyc" ? "KYC" :
                         (tool.toolType || "api") === "doc_verify" ? "Doc Verify" : "Callback"}
                      </span>
                    </td>
                    <td className="py-3">
                      {(tool.toolType || "api") === "api" ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11.5px]">
                          <span className="font-bold text-primary">{tool.method}</span>
                          <span className="max-w-[220px] truncate text-text-3" title={tool.urlTemplate}>
                            {tool.urlTemplate}
                          </span>
                        </div>
                      ) : (tool.toolType || "api") === "kyc" ? (
                        <span className="text-[12px] text-text-2">
                          {tool.config?.quizFields ? `${(tool.config.quizFields as string[]).length} quiz fields` : "KYC verification"}
                        </span>
                      ) : (tool.toolType || "api") === "doc_verify" ? (
                        <span className="text-[12px] text-text-2">
                          {tool.config?.accepted_types ? `${(tool.config.accepted_types as string[]).length} doc types` : "Document verification"}
                        </span>
                      ) : (
                        <span className="text-[12px] text-text-2">
                          {tool.config?.service_types ? `${(tool.config.service_types as string[]).length} services` : "Callback scheduling"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 font-semibold tabular-nums text-text">{tool.executionCount || 0}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openTestSandbox(tool)}
                          title="Test Tool Sandbox"
                          className="inline-flex items-center gap-1 rounded-md bg-surface border border-border px-2.5 py-1 text-[11.5px] font-semibold text-text hover:bg-surface-3 transition-colors shadow-xs"
                        >
                          <Icon name="play" size={12} className="text-primary" />
                          Test
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditTool(tool)}
                          title="Edit Tool"
                          className="p-1.5 rounded-md text-text-3 hover:text-text hover:bg-surface-3 transition-colors"
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTool(tool)}
                          title="Delete Tool"
                          className="p-1.5 rounded-md text-text-3 hover:text-danger hover:bg-danger/10 transition-colors"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}

      {mainTab === "datasets" && (
        <div className="flex flex-col gap-6">
          {/* Upload Customer Data Card */}
          <Card title="Upload Customer Verification Dataset" icon="upload">
            <div className="flex flex-col gap-4">
              <p className="text-[12.5px] text-text-3">
                Upload customer records (CSV or Excel) to verify customer identities during support conversations. The AI quizzes customers on selected fields (e.g. Date of Birth, Mother&apos;s Maiden Name) and grants access to protected fields upon passing.
              </p>

              {/* Drag and Drop Upload Area */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                  isDragging
                    ? "border-emerald-500 bg-emerald-500/10 ring-4 ring-emerald-500/20"
                    : "border-border bg-surface hover:border-emerald-500/50 hover:bg-surface-2"
                }`}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  id="mainKycFileInput"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                />

                {!kycUploadFile ? (
                  <label htmlFor="mainKycFileInput" className="cursor-pointer flex flex-col items-center gap-2 py-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                      <Icon name="upload" size={22} />
                    </span>
                    <p className="text-[13.5px] font-bold text-text">
                      Click to choose or drag &amp; drop customer CSV / Excel file
                    </p>
                    <p className="text-[12px] text-text-3 max-w-md">
                      Supports <code className="text-primary font-mono font-semibold">kyc_verification_test_data.csv</code> with account numbers, phone numbers, BVNs, and protected balances.
                    </p>
                  </label>
                ) : (
                  <div className="w-full max-w-2xl flex flex-col gap-4">
                    <div className="flex items-center justify-between rounded-xl bg-surface-2 border border-border p-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                          <Icon name="file" size={20} />
                        </span>
                        <div className="text-left">
                          <p className="text-[13px] font-bold text-text">{kycUploadFile.name}</p>
                          <p className="text-[11.5px] text-text-3">
                            {(kycUploadFile.size / 1024).toFixed(1)} KB
                            {detectedRowCount > 0 && ` · ~${detectedRowCount} records`}
                            {detectedColumns.length > 0 && ` · ${detectedColumns.length} columns`}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setKycUploadFile(null);
                          setDetectedColumns([]);
                          setDetectedRowCount(0);
                        }}
                        className="text-text-3 hover:text-danger p-1.5 rounded-md hover:bg-danger/10 transition-colors"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </div>

                    {/* Detected columns pills preview */}
                    {detectedColumns.length > 0 && (
                      <div className="text-left">
                        <span className="text-[11.5px] font-semibold text-text-3">Detected Columns ({detectedColumns.length}):</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {detectedColumns.map((c) => (
                            <span key={c} className="rounded-md bg-surface-3 px-2 py-0.5 text-[11px] font-mono text-text-2 border border-border/60">
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-left">
                      <div>
                        <label className="text-[11.5px] font-semibold text-text-3">Dataset Friendly Name</label>
                        <input
                          value={kycUploadName}
                          onChange={(e) => setKycUploadName(e.target.value)}
                          placeholder="e.g. Bank Customers Sep 2026"
                          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11.5px] font-semibold text-text-3">Primary Lookup Key Column</label>
                        {detectedColumns.length > 0 ? (
                          <div className="mt-1.5">
                            <Select
                              value={kycUploadLookupKey}
                              onChange={setKycUploadLookupKey}
                              options={detectedColumns.map((c) => ({
                                value: c,
                                label: ["account_number", "email", "phone_number", "phone"].includes(c.toLowerCase())
                                  ? `${c} (Recommended Identifier)`
                                  : c,
                              }))}
                              className="w-full"
                            />
                          </div>
                        ) : (
                          <input
                            value={kycUploadLookupKey}
                            onChange={(e) => setKycUploadLookupKey(e.target.value)}
                            placeholder="e.g. account_number, email"
                            className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-emerald-500 focus:outline-none"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setKycUploadFile(null);
                          setDetectedColumns([]);
                          setDetectedRowCount(0);
                        }}
                        className="rounded-lg border border-border bg-surface px-4 py-2 text-[12.5px] font-semibold text-text-2 hover:bg-surface-2 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={kycUploading}
                        onClick={uploadKycFile}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {kycUploading ? <Spinner size={15} /> : <Icon name="upload" size={15} />}
                        Upload Customer Dataset
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Uploaded Datasets List */}
          <Card title="Available Customer Datasets" icon="shield">
            {kycDataSources.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <Icon name="shield" size={28} />
                </span>
                <p className="mt-3 text-[14px] font-bold text-text">No KYC datasets uploaded yet</p>
                <p className="mt-1 max-w-md text-[12px] text-text-3">
                  Upload <code className="text-primary font-mono">kyc_verification_test_data.csv</code> above to test customer identity verification and protected balance reveal.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {kycDataSources.map((ds) => (
                  <div
                    key={ds.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4 transition-all hover:border-emerald-500/40 hover:shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
                          <Icon name="shield" size={16} />
                        </span>
                        <h4 className="text-[13.5px] font-bold text-text truncate">{ds.name}</h4>
                        <span className="rounded-md bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          {ds.rowCount} Customers
                        </span>
                        <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-mono text-primary font-bold">
                          Lookup: {ds.lookupKey}
                        </span>
                        {ds.filename && (
                          <span className="text-[11px] text-text-3 font-mono truncate max-w-[180px]" title={ds.filename}>
                            ({ds.filename})
                          </span>
                        )}
                      </div>

                      {/* Columns tags */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-text-3">Columns ({ds.columns.length}):</span>
                        {ds.columns.map((col) => (
                          <span
                            key={col}
                            className={`rounded px-1.5 py-0.2 text-[10.5px] font-mono border ${
                              col === ds.lookupKey
                                ? "bg-primary/15 border-primary/30 text-primary font-bold"
                                : "bg-surface-2 border-border text-text-3"
                            }`}
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-border/60">
                      <button
                        type="button"
                        onClick={() => openPreviewModal(ds)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] font-semibold text-text hover:bg-surface-2 transition-colors shadow-xs"
                      >
                        <Icon name="search" size={13} className="text-text-3" />
                        Preview Records
                      </button>
                      <button
                        type="button"
                        onClick={() => createToolFromDataSource(ds)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-xs"
                      >
                        <Icon name="plus" size={13} />
                        Create KYC Tool
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteKycDataSource(ds.id, ds.name)}
                        title="Delete Dataset"
                        className="p-1.5 rounded-lg text-text-3 hover:text-danger hover:bg-danger/10 transition-colors"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
      <Modal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title={editingTool ? `Edit ${editingTool.toolType === "kyc" ? "KYC" : editingTool.toolType === "doc_verify" ? "Doc Verify" : editingTool.toolType === "callback" ? "Callback" : "API"} Tool: ${editingTool.displayName}` : formToolType === "kyc" ? "Create KYC Verification Tool" : formToolType === "doc_verify" ? "Create Document Verification Tool" : formToolType === "callback" ? "Create Callback Scheduler" : "Create API Action"}
        size="lg"
      >
        <div className="flex flex-col gap-6">
          {/* Redesigned Modern Stepper */}
          <div className="relative flex items-center px-2 pt-1 pb-4 border-b border-border">
            {(() => {
              const steps = formToolType === "api"
                ? [
                    { step: 1, label: "Info & Type", icon: "sparkles" },
                    { step: 2, label: "API Endpoint", icon: "send" },
                    { step: 3, label: "Parameters", icon: "code" },
                    { step: 4, label: "Security & Review", icon: "shield" },
                  ]
                : formToolType === "kyc"
                ? [
                    { step: 1, label: "Info & Type", icon: "sparkles" },
                    { step: 2, label: "KYC Data Source", icon: "upload" },
                    { step: 3, label: "Quiz Configuration", icon: "shield" },
                    { step: 4, label: "Review & Save", icon: "check" },
                  ]
                : formToolType === "doc_verify"
                ? [
                    { step: 1, label: "Info & Type", icon: "sparkles" },
                    { step: 2, label: "Document Types", icon: "file" },
                    { step: 3, label: "Field Matching", icon: "search" },
                    { step: 4, label: "Review & Save", icon: "check" },
                  ]
                : [
                    { step: 1, label: "Info & Type", icon: "sparkles" },
                    { step: 2, label: "Schedule & Slots", icon: "calendar" },
                    { step: 3, label: "Services & Agents", icon: "users" },
                    { step: 4, label: "Review & Save", icon: "check" },
                  ];
              const total = steps.length;
              return (
                <>
                  <div className="absolute z-0 left-[12.5%] right-[12.5%] top-5 h-0.5 bg-border" />
                  <div
                    className="absolute z-0 left-[12.5%] top-5 h-0.5 bg-primary transition-all duration-300"
                    style={{ width: `${((wizardStep - 1) / (total - 1)) * 75}%` }}
                  />
                  {steps.map((s) => {
                    const isCurrent = wizardStep === s.step;
                    const isPast = wizardStep > s.step;
                    return (
                      <button
                        key={s.step}
                        type="button"
                        onClick={() => setWizardStep(s.step as 1 | 2 | 3 | 4)}
                        className="group relative z-10 flex flex-1 min-w-0 flex-col items-center gap-1.5 focus:outline-none"
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold transition-all duration-200 ${
                            isCurrent
                              ? "bg-primary text-white ring-4 ring-primary/20 shadow-md scale-110"
                              : isPast
                              ? "bg-primary text-white"
                              : "bg-surface-2 border border-border text-text-3 group-hover:border-primary/50 group-hover:text-text"
                          }`}
                        >
                          {isCurrent || isPast ? <Icon name="check" size={14} /> : s.step}
                        </div>
                        <span
                          className={`text-center text-[11.5px] font-semibold transition-colors ${
                            isCurrent ? "text-primary font-bold" : isPast ? "text-text" : "text-text-3"
                          }`}
                        >
                          {s.label}
                        </span>
                      </button>
                    );
                  })}
                </>
              );
            })()}
          </div>

          {/* Step 1: Info & Tool Type */}
          {wizardStep === 1 && (
            <div className="flex flex-col gap-5">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-2.5">
                <Icon name="sparkles" size={16} className="text-primary shrink-0 mt-0.5" />
                <p className="text-[12px] text-text-2 leading-relaxed">
                  Choose a tool type and give it a clear description. The AI agent reads your semantic instructions to know exactly when to use this tool during conversations.
                </p>
              </div>

              {/* Tool Type Selector */}
              <div>
                <label className="text-[12px] font-semibold text-text">Tool Type</label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {TOOL_TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormToolType(opt.value as typeof formToolType)}
                      className={`flex items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all ${
                        formToolType === opt.value
                          ? `${opt.bg} border-current shadow-sm`
                          : "border-border bg-surface hover:border-border/80 hover:bg-surface-2"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${opt.bg}`}>
                        <Icon name={opt.icon} size={16} className={opt.color} />
                      </span>
                      <div>
                        <p className={`text-[12.5px] font-bold ${formToolType === opt.value ? opt.color : "text-text"}`}>
                          {opt.label}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-3 leading-snug">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-text">Display Name</label>
                <input
                  value={formDisplayName}
                  onChange={(e) => {
                    setFormDisplayName(e.target.value);
                    if (!editingTool) {
                      setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, "_"));
                    }
                  }}
                  placeholder={formToolType === "kyc" ? "e.g. Verify Customer Identity" : formToolType === "doc_verify" ? "e.g. Validate ID Document" : formToolType === "callback" ? "e.g. Schedule Callback" : "e.g. Verify Customer BVN"}
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-text">LLM Function Identifier (snake_case)</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={formToolType === "kyc" ? "e.g. verify_customer_identity" : formToolType === "doc_verify" ? "e.g. validate_id_document" : formToolType === "callback" ? "e.g. schedule_callback" : "e.g. verify_customer_bvn"}
                  className="mt-1.5 w-full font-mono rounded-lg border border-border bg-surface px-3.5 py-2 text-[12px] text-text focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-text">Industry Category</label>
                <div className="mt-1.5">
                  <Select
                    value={formCategory}
                    onChange={setFormCategory}
                    options={CATEGORY_OPTIONS}
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-text">Semantic Instructions for AI Agent</label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    formToolType === "kyc"
                      ? "Tell the agent when to use this KYC tool (e.g. 'Use this tool when the customer requests account details, balance, or personal information that requires identity verification')."
                      : formToolType === "doc_verify"
                      ? "Tell the agent when to verify documents (e.g. 'Use this tool when the customer wants to verify their identity using a government-issued document')."
                      : formToolType === "callback"
                      ? "Tell the agent when to offer callback scheduling (e.g. 'Use this tool when the customer requests a callback or wants to schedule a meeting with support')."
                      : "Tell the agent exactly when and how to call this tool (e.g. 'Use this tool when the customer provides their tracking number and asks for shipment milestones')."
                  }
                  className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Step 2: Type-Specific Configuration */}
          {wizardStep === 2 && (
            <div className="flex flex-col gap-4">
              {/* ── API Endpoint Config ── */}
              {formToolType === "api" && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="text-[12px] font-semibold text-text">HTTP Method</label>
                      <div className="mt-1.5">
                        <Select
                          value={formMethod}
                          onChange={setFormMethod}
                          options={METHOD_OPTIONS}
                          className="w-full"
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[12px] font-semibold text-text">URL Template</label>
                      <input
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="https://api.yourdomain.com/v1/orders/{{order_id}}"
                        className="mt-1.5 w-full font-mono rounded-lg border border-border bg-surface px-3.5 py-2 text-[12px] text-text focus:border-primary focus:outline-none"
                      />
                      <p className="mt-1 text-[11px] text-text-3">Use `{"{{param}}"}` for dynamic parameters in the URL path or query string.</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[12px] font-semibold text-text">Request Headers</label>
                      <button
                        type="button"
                        onClick={() => setFormHeaders((h) => [...h, { key: "", value: "" }])}
                        className="text-[11.5px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Icon name="plus" size={12} />
                        Add Header
                      </button>
                    </div>
                    <div className="mt-2 flex flex-col gap-2">
                      {formHeaders.map((h, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={h.key}
                            onChange={(e) => { const next = [...formHeaders]; next[i].key = e.target.value; setFormHeaders(next); }}
                            placeholder="Header name (e.g. Authorization)"
                            className="w-1/2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text font-mono"
                          />
                          <input
                            value={h.value}
                            onChange={(e) => { const next = [...formHeaders]; next[i].value = e.target.value; setFormHeaders(next); }}
                            placeholder="Bearer token or {{api_key}}"
                            className="w-1/2 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text font-mono"
                          />
                          <button type="button" onClick={() => setFormHeaders((list) => list.filter((_, idx) => idx !== i))} className="text-text-3 hover:text-danger p-1.5 rounded-md hover:bg-danger/10 transition-colors">
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  {["POST", "PUT", "PATCH"].includes(formMethod) && (
                    <div>
                      <label className="text-[12px] font-semibold text-text">JSON Body Template</label>
                      <textarea
                        rows={3}
                        value={formBodyTemplate}
                        onChange={(e) => setFormBodyTemplate(e.target.value)}
                        placeholder='{"orderId": "{{order_id}}", "reason": "{{reason}}"}'
                        className="mt-1.5 w-full font-mono rounded-lg border border-border bg-surface px-3.5 py-2 text-[12px] text-text focus:border-primary focus:outline-none"
                      />
                      <p className="mt-1 text-[11px] text-text-3">Variables inside {"{{curly_brackets}}"} will be populated from parameter definitions.</p>
                    </div>
                  )}
                </>
              )}

              {/* ── KYC Data Source Config ── */}
              {formToolType === "kyc" && (
                <>
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-start gap-2.5">
                    <Icon name="shield" size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-text-2 leading-relaxed">
                      Upload a CSV or Excel file with your customer data. The AI will quiz customers against this data to verify their identity before revealing protected information.
                    </p>
                  </div>

                  {/* Existing data sources selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] font-semibold text-text">Select Linked Customer Dataset</label>
                      <span className="text-[11px] text-text-3">{kycDataSources.length} dataset{kycDataSources.length === 1 ? "" : "s"} available</span>
                    </div>
                    {kycDataSources.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-center text-[12px] text-text-3">
                        No customer datasets uploaded yet. Upload your CSV or Excel file below to get started.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5 max-h-56 overflow-y-auto pr-1">
                        {kycDataSources.map((ds) => {
                          const isSelected = (formConfig as Record<string, unknown>).dataSourceId === ds.id;
                          return (
                            <div
                              key={ds.id}
                              onClick={() => setFormConfig((prev) => ({ ...prev, dataSourceId: ds.id, lookupKey: ds.lookupKey }))}
                              className={`flex items-center justify-between rounded-xl border-2 p-3.5 text-left transition-all cursor-pointer ${
                                isSelected
                                  ? "border-emerald-500 bg-emerald-500/10 shadow-xs ring-1 ring-emerald-500/20"
                                  : "border-border bg-surface hover:border-emerald-500/40 hover:bg-surface-2"
                              }`}
                            >
                              <div className="min-w-0 flex-1 pr-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-[13px] font-bold text-text truncate">{ds.name}</p>
                                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
                                    {ds.rowCount} records
                                  </span>
                                  <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[10.5px] font-mono text-text-3">
                                    Key: {ds.lookupKey}
                                  </span>
                                </div>
                                <p className="mt-1 text-[11px] text-text-3 truncate">
                                  Columns: {ds.columns.slice(0, 7).join(", ")}{ds.columns.length > 7 ? ` +${ds.columns.length - 7} more` : ""}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPreviewModal(ds);
                                  }}
                                  className="text-[11px] font-semibold text-text-2 hover:text-primary bg-surface-2 hover:bg-surface-3 border border-border px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1"
                                >
                                  <Icon name="search" size={11} />
                                  Preview
                                </button>
                                <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                  isSelected ? "border-emerald-500 bg-emerald-600 text-white" : "border-border bg-surface"
                                }`}>
                                  {isSelected && <Icon name="check" size={12} />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Upload new data source card */}
                  <div className="rounded-xl border border-border bg-surface-2 p-4">
                    <p className="text-[12.5px] font-bold text-text mb-2">Upload Customer Data File (CSV / Excel)</p>
                    
                    {/* Drag and Drop Zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFileSelect(f);
                      }}
                      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-all ${
                        isDragging
                          ? "border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/20"
                          : "border-border bg-surface hover:border-emerald-500/50 hover:bg-surface-2"
                      }`}
                    >
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        id="builderKycFileInput"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileSelect(f);
                        }}
                      />
                      
                      {!kycUploadFile ? (
                        <label htmlFor="builderKycFileInput" className="cursor-pointer flex flex-col items-center gap-1.5 py-2">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                            <Icon name="upload" size={18} />
                          </span>
                          <p className="text-[12.5px] font-semibold text-text">
                            Click to browse or drag & drop customer CSV/Excel
                          </p>
                          <p className="text-[11px] text-text-3">
                            Compatible with <code className="text-primary font-mono">kyc_verification_test_data.csv</code> and standard customer records
                          </p>
                        </label>
                      ) : (
                        <div className="w-full flex flex-col gap-3">
                          <div className="flex items-center justify-between rounded-lg bg-surface-2 border border-border p-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600">
                                <Icon name="file" size={15} />
                              </span>
                              <div className="text-left">
                                <p className="text-[12px] font-bold text-text">{kycUploadFile.name}</p>
                                <p className="text-[10.5px] text-text-3">
                                  {(kycUploadFile.size / 1024).toFixed(1)} KB
                                  {detectedRowCount > 0 && ` · ~${detectedRowCount} records`}
                                  {detectedColumns.length > 0 && ` · ${detectedColumns.length} columns`}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setKycUploadFile(null);
                                setDetectedColumns([]);
                                setDetectedRowCount(0);
                              }}
                              className="text-text-3 hover:text-danger p-1 rounded transition-colors"
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </div>

                          {/* Pre-detected columns pills */}
                          {detectedColumns.length > 0 && (
                            <div className="text-left">
                              <span className="text-[11px] font-semibold text-text-3">Detected Columns ({detectedColumns.length}):</span>
                              <div className="mt-1 flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                {detectedColumns.map((c) => (
                                  <span key={c} className="rounded bg-surface-3 px-1.5 py-0.5 text-[10.5px] font-mono text-text-2 border border-border/50">
                                    {c}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3 text-left">
                            <div>
                              <label className="text-[11px] font-semibold text-text-3">Dataset Name</label>
                              <input
                                value={kycUploadName}
                                onChange={(e) => setKycUploadName(e.target.value)}
                                placeholder="e.g. Customer Registry Aug 2026"
                                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-emerald-500 focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-semibold text-text-3">Primary Lookup Key</label>
                              {detectedColumns.length > 0 ? (
                                <div className="mt-1">
                                  <Select
                                    value={kycUploadLookupKey}
                                    onChange={setKycUploadLookupKey}
                                    options={detectedColumns.map((c) => ({
                                      value: c,
                                      label: ["account_number", "email", "phone_number", "phone"].includes(c.toLowerCase())
                                        ? `${c} (Recommended)`
                                        : c,
                                    }))}
                                    className="w-full"
                                  />
                                </div>
                              ) : (
                                <input
                                  value={kycUploadLookupKey}
                                  onChange={(e) => setKycUploadLookupKey(e.target.value)}
                                  placeholder="e.g. account_number, email"
                                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-emerald-500 focus:outline-none"
                                />
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              disabled={kycUploading}
                              onClick={uploadKycFile}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-xs"
                            >
                              {kycUploading ? <Spinner size={13} /> : <Icon name="upload" size={13} />}
                              Upload & Select Dataset
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── Document Verification Config ── */}
              {formToolType === "doc_verify" && (
                <>
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3.5 flex items-start gap-2.5">
                    <Icon name="file" size={16} className="text-violet-600 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-text-2 leading-relaxed">
                      Configure which document types are accepted and what fields the AI should verify for each type.
                    </p>
                  </div>

                  <div>
                    <label className="text-[12px] font-semibold text-text">Accepted Document Types</label>
                    <p className="text-[11px] text-text-3 mb-2">Add the document types customers can use for verification.</p>
                    <div className="flex flex-wrap gap-2">
                      {docAcceptedTypes.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[12px] font-semibold text-violet-700">
                          {t.replace(/_/g, " ")}
                          <button type="button" onClick={() => { setDocAcceptedTypes((prev) => prev.filter((x) => x !== t)); }} className="text-violet-400 hover:text-violet-700">
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      ))}
                      <input
                        placeholder="Add type..."
                        className="w-28 rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-[12px] focus:border-violet-500 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                            const val = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "_");
                            if (!docAcceptedTypes.includes(val)) {
                              setDocAcceptedTypes((prev) => [...prev, val]);
                              setDocMatchFields((prev) => ({ ...prev, val: ["full_name", "date_of_birth"] }));
                            }
                            (e.target as HTMLInputElement).value = "";
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[12px] font-semibold text-text">Match Fields per Document Type</label>
                    <p className="text-[11px] text-text-3 mb-2">For each document type, define which fields the customer must provide and the AI will verify.</p>
                    <div className="flex flex-col gap-3">
                      {docAcceptedTypes.map((docType) => (
                        <div key={docType} className="rounded-xl border border-border bg-surface-2 p-3.5">
                          <p className="text-[12px] font-bold text-text mb-2 capitalize">{docType.replace(/_/g, " ")}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {(docMatchFields[docType] || []).map((f) => (
                              <span key={f} className="inline-flex items-center gap-1 rounded-md bg-surface border border-border px-2 py-0.5 text-[11px] font-semibold text-text-2">
                                {f.replace(/_/g, " ")}
                                <button type="button" onClick={() => setDocMatchFields((prev) => ({ ...prev, [docType]: (prev[docType] || []).filter((x) => x !== f) }))} className="text-text-3 hover:text-danger">
                                  <Icon name="close" size={10} />
                                </button>
                              </span>
                            ))}
                            <input
                              placeholder="Add field..."
                              className="w-24 rounded-md border border-dashed border-border bg-transparent px-1.5 py-0.5 text-[11px] focus:border-primary focus:outline-none"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                                  const val = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "_");
                                  setDocMatchFields((prev) => ({ ...prev, [docType]: [...(prev[docType] || []), val] }));
                                  (e.target as HTMLInputElement).value = "";
                                }
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── Callback Schedule Config ── */}
              {formToolType === "callback" && (
                <>
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 flex items-start gap-2.5">
                    <Icon name="calendar" size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-text-2 leading-relaxed">
                      Configure available time slots for callbacks. The AI will show customers available times and book appointments.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[12px] font-semibold text-text">Available Time Slots</label>
                      <button
                        type="button"
                        onClick={() => setCallbackSlots((prev) => [...prev, { day: "monday", start: "09:00", end: "17:00" }])}
                        className="text-[11.5px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Icon name="plus" size={12} />
                        Add Slot
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      {callbackSlots.map((slot, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2.5">
                          <select
                            value={slot.day}
                            onChange={(e) => { const next = [...callbackSlots]; next[i].day = e.target.value; setCallbackSlots(next); }}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text"
                          >
                            {["monday","tuesday","wednesday","thursday","friday","saturday","sunday"].map((d) => (
                              <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                            ))}
                          </select>
                          <input
                            type="time"
                            value={slot.start}
                            onChange={(e) => { const next = [...callbackSlots]; next[i].start = e.target.value; setCallbackSlots(next); }}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text"
                          />
                          <span className="text-[12px] text-text-3">to</span>
                          <input
                            type="time"
                            value={slot.end}
                            onChange={(e) => { const next = [...callbackSlots]; next[i].end = e.target.value; setCallbackSlots(next); }}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-text"
                          />
                          <button type="button" onClick={() => setCallbackSlots((prev) => prev.filter((_, idx) => idx !== i))} className="ml-auto text-text-3 hover:text-danger p-1 rounded-md hover:bg-danger/10 transition-colors">
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] font-semibold text-text">Buffer Between Slots</label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="number"
                          value={callbackBufferMinutes}
                          onChange={(e) => setCallbackBufferMinutes(Number(e.target.value))}
                          min={0}
                          max={120}
                          className="w-20 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text"
                        />
                        <span className="text-[12px] text-text-3">minutes</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold text-text">Max Advance Booking</label>
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="number"
                          value={callbackMaxAdvanceDays}
                          onChange={(e) => setCallbackMaxAdvanceDays(Number(e.target.value))}
                          min={1}
                          max={90}
                          className="w-20 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text"
                        />
                        <span className="text-[12px] text-text-3">days</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Parameters (API) or Type-Specific Config */}
          {wizardStep === 3 && (
            <div className="flex flex-col gap-4">
              {/* ── API Parameters ── */}
              {formToolType === "api" && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12.5px] font-semibold text-text">Parameter Schema Definitions</p>
                      <p className="text-[11.5px] text-text-3">Define variables the AI Agent must gather before calling this action.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormParams((p) => [...p, { name: "", type: "string", description: "", required: true }])}
                      className="inline-flex items-center gap-1 rounded-md bg-surface border border-border px-3 py-1 text-[11.5px] font-bold text-primary hover:bg-primary hover:text-white transition-colors"
                    >
                      <Icon name="plus" size={12} />
                      Add Parameter
                    </button>
                  </div>
                  {formParams.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-[12px] text-text-3">
                      No parameters defined yet. Click Add Parameter if your endpoint requires dynamic inputs.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
                      {formParams.map((param, i) => (
                        <div key={i} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-2 p-3.5">
                          <div className="flex items-center gap-2">
                            <input value={param.name} onChange={(e) => { const next = [...formParams]; next[i].name = e.target.value; setFormParams(next); }} placeholder="parameter_name" className="w-1/2 font-mono rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text" />
                            <select value={param.type} onChange={(e) => { const next = [...formParams]; next[i].type = e.target.value as "string" | "number" | "boolean"; setFormParams(next); }} className="rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text">
                              <option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option>
                            </select>
                            <label className="flex items-center gap-1.5 text-[11.5px] text-text-2 ml-auto cursor-pointer">
                              <input type="checkbox" checked={param.required} onChange={(e) => { const next = [...formParams]; next[i].required = e.target.checked; setFormParams(next); }} className="rounded border-border text-primary" />
                              Required
                            </label>
                            <button type="button" onClick={() => setFormParams((p) => p.filter((_, idx) => idx !== i))} className="text-text-3 hover:text-danger p-1 rounded-md hover:bg-danger/10 transition-colors">
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                          <input value={param.description} onChange={(e) => { const next = [...formParams]; next[i].description = e.target.value; setFormParams(next); }} placeholder="Prompt guidance for AI" className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-[12px] text-text" />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── KYC Quiz Configuration ── */}
              {formToolType === "kyc" && (() => {
                const activeDs = kycDataSources.find((d) => d.id === (formConfig as Record<string, unknown>).dataSourceId);
                const availableCols = activeDs?.columns || (detectedColumns.length ? detectedColumns : [
                  "account_number", "email", "phone_number", "full_name", "date_of_birth", "bvn", "nin", "address", "state_of_origin", "mother_maiden_name", "balance", "account_type", "bvn_status", "kyc_tier"
                ]);
                const lookupCol = ((formConfig as Record<string, unknown>).lookupKey as string) || activeDs?.lookupKey || kycUploadLookupKey;

                return (
                  <>
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-start gap-2.5">
                      <Icon name="shield" size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[12px] text-text-2 leading-relaxed">
                          Configure which fields the AI will quiz customers on, which fields are protected (revealed after verification), and the passing score.
                        </p>
                        {activeDs && (
                          <p className="mt-1 text-[11.5px] font-semibold text-emerald-700">
                            Linked Dataset: <span className="font-bold underline">{activeDs.name}</span> ({activeDs.rowCount} records) &middot; Lookup Key: <code className="font-mono bg-emerald-500/10 px-1 py-0.2 rounded text-emerald-800">{lookupCol}</code>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Interactive Column Chips from Dataset */}
                    <div className="rounded-xl border border-border bg-surface-2 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div>
                          <span className="text-[12px] font-bold text-text">Columns in Dataset</span>
                          <span className="ml-1.5 text-[11px] text-text-3">({availableCols.length} columns)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const recommendedQuiz = ["full_name", "date_of_birth", "phone_number", "state_of_origin", "mother_maiden_name"].filter((c) => availableCols.includes(c));
                            const recommendedProtected = ["balance", "account_type", "bvn_status", "kyc_tier"].filter((c) => availableCols.includes(c));
                            setKycQuizFields(recommendedQuiz.length ? recommendedQuiz : ["full_name", "date_of_birth"]);
                            setKycProtectedFields(recommendedProtected.length ? recommendedProtected : ["balance"]);
                            toast("Applied Recommended Banking KYC Preset");
                          }}
                          className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 px-2.5 py-1 rounded-md transition-colors"
                        >
                          ⚡ Apply Recommended Banking Preset
                        </button>
                      </div>
                      <p className="text-[11px] text-text-3 mb-2.5">
                        Click <strong className="text-emerald-600">+ Quiz</strong> to add to verification questions or <strong className="text-amber-600">+ Protected</strong> to reveal after passing:
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {availableCols.map((col) => {
                          const isLookup = col.toLowerCase() === lookupCol.toLowerCase();
                          const isQuiz = kycQuizFields.includes(col);
                          const isProtected = kycProtectedFields.includes(col);

                          return (
                            <div
                              key={col}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] transition-all ${
                                isLookup
                                  ? "border-primary/40 bg-primary/10 text-primary font-bold"
                                  : isQuiz
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 font-semibold"
                                  : isProtected
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 font-semibold"
                                  : "border-border bg-surface text-text-2 hover:border-border/80"
                              }`}
                            >
                              <span className="font-mono">{col}</span>
                              {isLookup ? (
                                <span className="text-[9px] uppercase tracking-wider bg-primary text-white px-1 py-0.2 rounded font-bold">
                                  Lookup Key
                                </span>
                              ) : (
                                <div className="flex items-center gap-1 ml-1 border-l border-border/60 pl-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isQuiz) setKycQuizFields((prev) => prev.filter((x) => x !== col));
                                      else {
                                        setKycQuizFields((prev) => [...prev, col]);
                                        setKycProtectedFields((prev) => prev.filter((x) => x !== col));
                                      }
                                    }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors ${
                                      isQuiz ? "bg-emerald-600 text-white" : "text-emerald-600 hover:bg-emerald-500/10"
                                    }`}
                                  >
                                    {isQuiz ? "Quiz ✓" : "+ Quiz"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (isProtected) setKycProtectedFields((prev) => prev.filter((x) => x !== col));
                                      else {
                                        setKycProtectedFields((prev) => [...prev, col]);
                                        setKycQuizFields((prev) => prev.filter((x) => x !== col));
                                      }
                                    }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors ${
                                      isProtected ? "bg-amber-600 text-white" : "text-amber-600 hover:bg-amber-500/10"
                                    }`}
                                  >
                                    {isProtected ? "Protected ✓" : "+ Protected"}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-text">Selected Quiz Fields ({kycQuizFields.length})</label>
                      <p className="text-[11px] text-text-3 mb-2">Customer must answer these correctly during identity verification.</p>
                      <div className="flex flex-wrap gap-2">
                        {kycQuizFields.map((f) => (
                          <span key={f} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
                            {f.replace(/_/g, " ")}
                            <button type="button" onClick={() => setKycQuizFields((prev) => prev.filter((x) => x !== f))} className="text-emerald-400 hover:text-emerald-700">
                              <Icon name="close" size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          placeholder="Add field..."
                          className="w-28 rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-[12px] focus:border-emerald-500 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                              const val = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "_");
                              if (!kycQuizFields.includes(val)) setKycQuizFields((prev) => [...prev, val]);
                              (e.target as HTMLInputElement).value = "";
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-text">Selected Protected Fields ({kycProtectedFields.length})</label>
                      <p className="text-[11px] text-text-3 mb-2">These values are revealed to the customer only after they pass verification.</p>
                      <div className="flex flex-wrap gap-2">
                        {kycProtectedFields.map((f) => (
                          <span key={f} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[12px] font-semibold text-amber-700">
                            {f.replace(/_/g, " ")}
                            <button type="button" onClick={() => setKycProtectedFields((prev) => prev.filter((x) => x !== f))} className="text-amber-400 hover:text-amber-700">
                              <Icon name="close" size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          placeholder="Add field..."
                          className="w-28 rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-[12px] focus:border-amber-500 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                              const val = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "_");
                              if (!kycProtectedFields.includes(val)) setKycProtectedFields((prev) => [...prev, val]);
                              (e.target as HTMLInputElement).value = "";
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] font-semibold text-text">Passing Score</label>
                        <div className="mt-1.5 flex items-center gap-3">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={5}
                            value={kycPassingScore}
                            onChange={(e) => setKycPassingScore(Number(e.target.value))}
                            className="flex-1 accent-emerald-600"
                          />
                          <span className="text-[13px] font-bold text-emerald-600 w-10 text-right">{kycPassingScore}%</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-text">Failure Message</label>
                        <input
                          value={kycReferralMessage}
                          onChange={(e) => setKycReferralMessage(e.target.value)}
                          placeholder="Message shown when verification fails"
                          className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* ── Doc Verify Field Matching ── */}
              {formToolType === "doc_verify" && (
                <>
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3.5 flex items-start gap-2.5">
                    <Icon name="search" size={16} className="text-violet-600 shrink-0 mt-0.5" />
                    <p className="text-[12px] text-text-2 leading-relaxed">
                      Configure the verification and failure messages shown to customers after document review.
                    </p>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-text">Verification Success Message</label>
                    <textarea
                      rows={2}
                      value={docVerificationMsg}
                      onChange={(e) => setDocVerificationMsg(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-text">Verification Failure Message</label>
                    <textarea
                      rows={2}
                      value={docFailureMsg}
                      onChange={(e) => setDocFailureMsg(e.target.value)}
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
                    />
                  </div>
                </>
              )}

              {/* ── Callback Services & Agents ── */}
              {formToolType === "callback" && (
                <>
                  <div>
                    <label className="text-[12px] font-semibold text-text">Service Types</label>
                    <p className="text-[11px] text-text-3 mb-2">Add the types of callbacks customers can book.</p>
                    <div className="flex flex-wrap gap-2">
                      {callbackServiceTypes.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[12px] font-semibold text-amber-700">
                          {s.replace(/_/g, " ")}
                          <button type="button" onClick={() => setCallbackServiceTypes((prev) => prev.filter((x) => x !== s))} className="text-amber-400 hover:text-amber-700">
                            <Icon name="close" size={12} />
                          </button>
                        </span>
                      ))}
                      <input
                        placeholder="Add service..."
                        className="w-28 rounded-lg border border-dashed border-border bg-transparent px-2 py-1 text-[12px] focus:border-amber-500 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                            const val = (e.target as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, "_");
                            if (!callbackServiceTypes.includes(val)) setCallbackServiceTypes((prev) => [...prev, val]);
                            (e.target as HTMLInputElement).value = "";
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[12px] font-semibold text-text">Assigned Agents (optional)</label>
                      <button
                        type="button"
                        onClick={() => setCallbackAgents((prev) => [...prev, ""])}
                        className="text-[11.5px] font-bold text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Icon name="plus" size={12} />
                        Add Agent
                      </button>
                    </div>
                    {callbackAgents.length === 0 ? (
                      <p className="text-[12px] text-text-3 italic">No agents assigned — bookings will be unassigned.</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {callbackAgents.map((a, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              value={a}
                              onChange={(e) => { const next = [...callbackAgents]; next[i] = e.target.value; setCallbackAgents(next); }}
                              placeholder="Agent name"
                              className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text focus:border-primary focus:outline-none"
                            />
                            <button type="button" onClick={() => setCallbackAgents((prev) => prev.filter((_, idx) => idx !== i))} className="text-text-3 hover:text-danger p-1 rounded-md hover:bg-danger/10 transition-colors">
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="text-[12px] font-semibold text-text">Confirmation Message Template</label>
                    <textarea
                      rows={2}
                      value={callbackConfirmationMsg}
                      onChange={(e) => setCallbackConfirmationMsg(e.target.value)}
                      placeholder="Your callback is confirmed for {date} at {time}."
                      className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-text-3">Use {"{date}"}, {"{time}"}, {"{phone}"} as placeholders.</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 4: Security Gate & Review */}
          {wizardStep === 4 && (
            <div className="flex flex-col gap-4">
              {/* API: show HITL + Response Extractor */}
              {formToolType === "api" && (
                <>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="flex items-center gap-1.5 text-[13px] font-bold text-text">
                          <Icon name="shield" size={15} className="text-amber-600 dark:text-amber-400" />
                          Zero-Trust Human-In-The-Loop (HITL) Gate
                        </h4>
                        <p className="mt-1 text-[12px] text-text-2 leading-relaxed">
                          When enabled, the AI assistant will pause and generate an interactive approval card in the support team inbox before executing this tool. Use this for high-impact operations (refunds, cancellations, card locks).
                        </p>
                      </div>
                      <Switch checked={formRequiresApproval} onChange={setFormRequiresApproval} label="Require Human Approval" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[12px] font-semibold text-text">Response Extractor Fields</label>
                    <input value={formResponseExtractor} onChange={(e) => setFormResponseExtractor(e.target.value)} placeholder="e.g. status, amount, transaction_id" className="mt-1.5 w-full rounded-lg border border-border bg-surface px-3.5 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none" />
                    <p className="mt-1 text-[11px] text-text-3">Comma-separated keys to pull from response JSON to synthesize the final customer reply.</p>
                  </div>
                </>
              )}

              {/* Non-API: show review summary */}
              {formToolType !== "api" && (
                <>
                  <div className="rounded-xl border border-border bg-surface-2 p-4">
                    <h4 className="text-[13px] font-bold text-text mb-3">Review Your {formToolType === "kyc" ? "KYC" : formToolType === "doc_verify" ? "Document Verification" : "Callback"} Tool</h4>
                    <div className="grid grid-cols-2 gap-3 text-[12px]">
                      <div><span className="text-text-3">Name:</span> <span className="font-semibold text-text">{formDisplayName || formName}</span></div>
                      <div><span className="text-text-3">Type:</span> <span className="font-semibold text-text capitalize">{formToolType.replace("_", " ")}</span></div>
                      <div className="col-span-2"><span className="text-text-3">Description:</span> <span className="text-text">{formDescription || "—"}</span></div>
                      {formToolType === "kyc" && (
                        <>
                          <div><span className="text-text-3">Quiz Fields:</span> <span className="font-semibold text-text">{kycQuizFields.length}</span></div>
                          <div><span className="text-text-3">Protected Fields:</span> <span className="font-semibold text-text">{kycProtectedFields.length}</span></div>
                          <div><span className="text-text-3">Passing Score:</span> <span className="font-semibold text-emerald-600">{kycPassingScore}%</span></div>
                          <div><span className="text-text-3">Data Source:</span> <span className="font-semibold text-text">{(formConfig as Record<string, unknown>).dataSourceId ? "Linked" : "Not linked"}</span></div>
                        </>
                      )}
                      {formToolType === "doc_verify" && (
                        <>
                          <div><span className="text-text-3">Doc Types:</span> <span className="font-semibold text-text">{docAcceptedTypes.length}</span></div>
                          <div><span className="text-text-3">Total Match Fields:</span> <span className="font-semibold text-text">{Object.values(docMatchFields).flat().length}</span></div>
                        </>
                      )}
                      {formToolType === "callback" && (
                        <>
                          <div><span className="text-text-3">Time Slots:</span> <span className="font-semibold text-text">{callbackSlots.length}</span></div>
                          <div><span className="text-text-3">Service Types:</span> <span className="font-semibold text-text">{callbackServiceTypes.length}</span></div>
                          <div><span className="text-text-3">Buffer:</span> <span className="font-semibold text-text">{callbackBufferMinutes} min</span></div>
                          <div><span className="text-text-3">Max Advance:</span> <span className="font-semibold text-text">{callbackMaxAdvanceDays} days</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="flex items-center gap-1.5 text-[13px] font-bold text-text">
                          <Icon name="shield" size={15} className="text-amber-600" />
                          Require Human Approval Before Execution?
                        </h4>
                        <p className="mt-1 text-[12px] text-text-2 leading-relaxed">
                          When enabled, the AI will pause and ask a human agent to approve before completing this action.
                        </p>
                      </div>
                      <Switch checked={formRequiresApproval} onChange={setFormRequiresApproval} label="Require Approval" />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              disabled={wizardStep === 1}
              onClick={() => setWizardStep((s) => (s - 1) as 1 | 2 | 3 | 4)}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-[12px] font-semibold text-text hover:bg-surface-2 disabled:opacity-40 transition-colors shadow-xs"
            >
              Previous
            </button>
            <div className="flex items-center gap-2">
              {wizardStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
                  className="rounded-lg bg-primary px-5 py-2 text-[12px] font-semibold text-white hover:bg-primary-dark transition-colors shadow-sm"
                >
                  Next Step
                </button>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveTool}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-[12px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? <Spinner size={14} /> : <Icon name="check" size={14} />}
                  Save & Register Action
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Interactive Live Test Sandbox Modal */}
      <Modal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        title={`Live Test Sandbox: ${testingTool?.displayName}`}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-text-2">
            Simulate a live request using test arguments. Verifies URL parameter interpolation, headers, and response structure.
          </p>

          {testingTool && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-center gap-2 font-mono text-[12px]">
                <span className="font-bold text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                  {testingTool.method}
                </span>
                <span className="text-text truncate">{testingTool.urlTemplate}</span>
              </div>

              {/* Dynamic Argument Inputs */}
              <div className="mt-2 flex flex-col gap-2.5">
                <p className="text-[11.5px] font-bold text-text-3 uppercase tracking-wider">Test Arguments</p>
                {(testingTool.parametersSchema || []).map((param) => (
                  <div key={param.name} className="flex items-center gap-2">
                    <span className="w-1/3 font-mono text-[12px] text-text">{param.name}:</span>
                    <input
                      value={testArgs[param.name] || ""}
                      onChange={(e) =>
                        setTestArgs((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      placeholder={`Sample ${param.name}`}
                      className="w-2/3 rounded-lg border border-border bg-surface px-3 py-1.5 text-[12px] text-text font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={testRunning}
                onClick={runTest}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-primary-dark disabled:opacity-50 transition-colors shadow-sm"
              >
                {testRunning ? <Spinner size={15} /> : <Icon name="play" size={15} />}
                Run Live Request
              </button>
            </div>
          )}

          {/* Test Results Output */}
          {testResult && (
            <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-text">Execution Result</span>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    testResult.statusCode >= 200 && testResult.statusCode < 300
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-danger/15 text-danger border border-danger/20"
                  }`}>
                    HTTP {testResult.statusCode}
                  </span>
                  <span className="text-[11px] text-text-3 font-mono">{testResult.elapsedMs}ms</span>
                </div>
              </div>

              <div className="mt-2 rounded-lg bg-slate-950 p-3.5 font-mono text-[11.5px] text-emerald-400 overflow-x-auto max-h-60 border border-slate-800">
                <pre>{JSON.stringify(testResult.response, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Dataset Record Preview Modal */}
      <Modal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title={`Dataset Records: ${previewDataSource?.name || ""}`}
        size="2xl"
        className="!max-w-[1240px] !w-[96vw]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] text-text-2">
              <span>Lookup Key: <strong className="text-text font-mono">{previewDataSource?.lookupKey}</strong></span>
              <span>•</span>
              <span>Total Rows: <strong className="text-text">{previewTotal || previewDataSource?.rowCount || 0}</strong></span>
            </div>
            {previewDataSource && (
              <button
                type="button"
                onClick={() => {
                  setPreviewModalOpen(false);
                  createToolFromDataSource(previewDataSource);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-emerald-700 transition-colors shadow-xs"
              >
                <Icon name="plus" size={13} />
                Create Verification Tool
              </button>
            )}
          </div>

          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size={24} />
            </div>
          ) : previewRecords.length === 0 ? (
            <div className="py-12 text-center text-text-3 text-[13px]">
              No records found in this dataset.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-[12px] whitespace-nowrap">
                <thead className="border-b border-border bg-surface-2 text-text-3 font-semibold uppercase tracking-wider text-[10.5px]">
                  <tr>
                    <th className="px-3.5 py-2.5">Lookup ({previewDataSource?.lookupKey})</th>
                    {(previewDataSource?.columns || []).filter((c) => c !== previewDataSource?.lookupKey).map((col) => (
                      <th key={col} className="px-3.5 py-2.5">{col.replace(/_/g, " ")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-surface-2/60 transition-colors">
                      <td className="px-3.5 py-2.5 font-mono font-semibold text-primary">
                        {rec.lookupValue || (rec.data[previewDataSource?.lookupKey || ""] as string) || "—"}
                      </td>
                      {(previewDataSource?.columns || []).filter((c) => c !== previewDataSource?.lookupKey).map((col) => (
                        <td key={col} className="px-3.5 py-2.5 text-text-2">
                          {rec.data[col] !== undefined && rec.data[col] !== null ? String(rec.data[col]) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {previewTotal > 20 && (
            <div className="flex items-center justify-between pt-2 border-t border-border text-[12px]">
              <span className="text-text-3">Page {previewPage} of {Math.ceil(previewTotal / 20)}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={previewPage <= 1 || previewLoading}
                  onClick={() => previewDataSource && loadPreviewRecords(previewDataSource.id, previewPage - 1)}
                  className="rounded-lg border border-border px-3 py-1 text-text disabled:opacity-40 hover:bg-surface-2"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={previewPage * 20 >= previewTotal || previewLoading}
                  onClick={() => previewDataSource && loadPreviewRecords(previewDataSource.id, previewPage + 1)}
                  className="rounded-lg border border-border px-3 py-1 text-text disabled:opacity-40 hover:bg-surface-2"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Standalone Upload Customer KYC Dataset Modal */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title="Upload Customer KYC Dataset"
        size="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-text-2">
            Upload customer verification records in CSV format (up to 50MB). The system automatically parses headers and validates customer lookup keys.
          </p>

          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileSelect(file);
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
              isDragging
                ? "border-emerald-500 bg-emerald-500/10 scale-[1.01]"
                : kycUploadFile
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-border hover:border-primary/50 hover:bg-surface-2/40"
            }`}
            onClick={() => document.getElementById("standalone-kyc-file-input")?.click()}
          >
            <input
              id="standalone-kyc-file-input"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 mb-2">
              <Icon name="upload" size={22} />
            </div>
            {kycUploadFile ? (
              <>
                <p className="text-[13px] font-semibold text-text">{kycUploadFile.name}</p>
                <p className="text-[11.5px] text-text-3 mt-0.5">
                  {(kycUploadFile.size / 1024).toFixed(1)} KB • {detectedRowCount > 0 ? `${detectedRowCount} customer rows` : "Ready to upload"}
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setKycUploadFile(null);
                    setDetectedColumns([]);
                    setDetectedRowCount(0);
                  }}
                  className="mt-2 text-[11px] font-semibold text-danger hover:underline"
                >
                  Change File
                </button>
              </>
            ) : (
              <>
                <p className="text-[13px] font-medium text-text">
                  Drag and drop your customer CSV file here, or <span className="text-emerald-600 font-semibold underline">browse</span>
                </p>
                <p className="text-[11.5px] text-text-3 mt-1">Supports UTF-8 CSV with column headers (e.g. account_number, full_name, etc.)</p>
              </>
            )}
          </div>

          {/* Configuration */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-[12px] font-semibold text-text">Dataset Name</label>
              <input
                value={kycUploadName}
                onChange={(e) => setKycUploadName(e.target.value)}
                placeholder="e.g. Core Banking Customers 2026"
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[12px] font-semibold text-text">Customer Lookup Key (Primary Identifier)</label>
              {detectedColumns.length > 0 ? (
                <select
                  value={kycUploadLookupKey}
                  onChange={(e) => setKycUploadLookupKey(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
                >
                  {detectedColumns.map((col) => (
                    <option key={col} value={col}>
                      {col} {["account_number", "email", "phone_number", "bvn", "customer_id"].includes(col) ? "(Recommended)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={kycUploadLookupKey}
                  onChange={(e) => setKycUploadLookupKey(e.target.value)}
                  placeholder="e.g. account_number"
                  className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] text-text focus:border-primary focus:outline-none"
                />
              )}
              <p className="text-[11px] text-text-3 mt-1">
                The AI will prompt the customer for this identifier to locate their record during conversation.
              </p>
            </div>

            {detectedColumns.length > 0 && (
              <div>
                <label className="text-[11.5px] font-semibold text-text-2">Detected Columns ({detectedColumns.length})</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {detectedColumns.map((col) => (
                    <span
                      key={col}
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-mono ${
                        col === kycUploadLookupKey
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/30"
                          : "bg-surface-2 text-text-2 border border-border"
                      }`}
                    >
                      {col}
                      {col === kycUploadLookupKey && " ★"}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setUploadModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-[12px] font-semibold text-text hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!kycUploadFile || kycUploading}
              onClick={uploadKycFile}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors shadow-sm"
            >
              {kycUploading ? <Spinner size={14} /> : <Icon name="upload" size={14} />}
              {kycUploading ? "Uploading & Indexing..." : "Upload & Save Dataset"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

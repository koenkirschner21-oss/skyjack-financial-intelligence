export interface SampleDatasetSpec {
  id: string;
  fileName: string;
  title: string;
  description: string;
  expectedOutcomeSummary: string;
  isBlankTemplate?: boolean;
  csvContent: string;
}

export const CLEAN_FINANCIAL_RECORDS_CSV = [
  'transaction_id,posting_date,accounting_period,region,plant,department,gl_account,expense_category,description,amount_cad,supplier_id,invoice_reference,approval_reference,prepared_by,supporting_reference',
  'TX-CLN-001,2026-07-06,Q3 2026,North America,Plant 1,Operations,GL 5110,Direct Materials,[SYNTHETIC EVALUATION DATA] Structural steel coil replenishment,42850.25,SUP-101,INV-CLN-3001,APR-2026-101,J. Alvarez,PO-88101',
  'TX-CLN-002,2026-07-10,Q3 2026,North America,Plant 2,Operations,GL 5120,Tooling & Consumables,[SYNTHETIC EVALUATION DATA] CNC weld tips and shielding gas,18420.50,SUP-104,INV-CLN-3002,APR-2026-102,D. Morales,PO-88104',
  'TX-CLN-003,2026-07-14,Q3 2026,Europe,Plant 1,Procurement,GL 5210,Component Sourcing,[SYNTHETIC EVALUATION DATA] Hydraulic valve manifold batch,64110.00,SUP-209,INV-CLN-3003,APR-2026-103,R. Lindqvist,PO-88109',
  'TX-CLN-004,2026-07-18,Q3 2026,North America,Plant 1,Logistics,GL 5410,Freight Out,[SYNTHETIC EVALUATION DATA] Scheduled outbound carrier linehaul,29340.75,SUP-302,INV-CLN-3004,APR-2026-104,M. Silva,BOL-77401',
  'TX-CLN-005,2026-07-22,Q3 2026,Asia,Corporate,Sales,GL 6210,Channel Marketing,[SYNTHETIC EVALUATION DATA] Regional distributor trade show booth,14900.00,SUP-512,INV-CLN-3005,APR-2026-105,K. Takahashi,MKT-2026-09',
  'TX-CLN-006,2026-07-27,Q3 2026,North America,Plant 2,Operations,GL 5130,Preventive Maintenance,[SYNTHETIC EVALUATION DATA] Paint booth filter bank replacement,11680.40,SUP-118,INV-CLN-3006,APR-2026-106,D. Morales,WO-44910',
  'TX-CLN-007,2026-08-03,Q3 2026,Europe,Corporate,Finance,GL 6310,External Audit,[SYNTHETIC EVALUATION DATA] Quarterly statutory compliance review,38500.00,SUP-601,INV-CLN-3007,APR-2026-107,H. Park,ENG-2026-03',
  'TX-CLN-008,2026-08-07,Q3 2026,South America,Corporate,Sales,GL 6220,Field Technical Support,[SYNTHETIC EVALUATION DATA] Dealer service training travel and kit,9740.80,SUP-533,INV-CLN-3008,APR-2026-108,C. Mendoza,TRV-99102',
  'TX-CLN-009,2026-08-12,Q3 2026,North America,Plant 1,Procurement,GL 5115,Fasteners & Hardware,[SYNTHETIC EVALUATION DATA] High-tensile grade 8 bolt consignment,21300.00,SUP-145,INV-CLN-3009,APR-2026-109,R. Patel,PO-88145',
  'TX-CLN-010,2026-08-16,Q3 2026,Australia and New Zealand,Corporate,Logistics,GL 5410,Freight Out,[SYNTHETIC EVALUATION DATA] Scheduled port drayage to Brisbane terminal,33620.15,SUP-319,INV-CLN-3010,APR-2026-110,M. Silva,BOL-77419',
  'TX-CLN-011,2026-08-20,Q3 2026,North America,Plant 2,Operations,GL 5140,Quality Inspection,[SYNTHETIC EVALUATION DATA] Ultrasonic weld nondestructive testing,16250.00,SUP-177,INV-CLN-3011,APR-2026-111,D. Morales,QC-31208',
  'TX-CLN-012,2026-08-25,Q3 2026,Europe,Plant 1,Procurement,GL 5210,Component Sourcing,[SYNTHETIC EVALUATION DATA] Powder coat resin drum order,52900.60,SUP-214,INV-CLN-3012,APR-2026-112,R. Lindqvist,PO-88214',
  'TX-CLN-013,2026-08-29,Q3 2026,North America,Plant 1,Finance,GL 6320,Insurance & Risk,[SYNTHETIC EVALUATION DATA] Q3 plant property coverage installment,74200.00,SUP-615,INV-CLN-3013,APR-2026-113,H. Park,POL-2026-Q3',
  'TX-CLN-014,2026-09-02,Q3 2026,Asia,Plant 2,Procurement,GL 5110,Direct Materials,[SYNTHETIC EVALUATION DATA] Precision limit switch assembly batch,41850.00,SUP-521,INV-CLN-3014,APR-2026-114,R. Patel,PO-88221',
  'TX-CLN-015,2026-09-06,Q3 2026,North America,Plant 2,Logistics,GL 5410,Freight Out,[SYNTHETIC EVALUATION DATA] Dedicated flatbed outbound corridor,24780.90,SUP-305,INV-CLN-3015,APR-2026-115,M. Silva,BOL-77455',
  'TX-CLN-016,2026-09-10,Q3 2026,North America,Corporate,Customs and Trade,GL 5430,Brokerage Retainer,[SYNTHETIC EVALUATION DATA] Quarterly customs compliance advisory fee,12400.00,SUP-702,INV-CLN-3016,APR-2026-116,M. Silva,RET-2026-03',
  'TX-CLN-017,2026-09-14,Q3 2026,South America,Corporate,Procurement,GL 5210,Component Sourcing,[SYNTHETIC EVALUATION DATA] Safety decal and manual printing batch,7890.35,SUP-540,INV-CLN-3017,APR-2026-117,C. Mendoza,PO-88240',
  'TX-CLN-018,2026-09-18,Q3 2026,North America,Plant 1,Operations,GL 5150,Utilities & Energy,[SYNTHETIC EVALUATION DATA] Guelph Plant 1 industrial power billing,84500.00,SUP-190,INV-CLN-3018,APR-2026-118,D. Morales,UTL-2026-09',
  'TX-CLN-019,2026-09-23,Q3 2026,Australia and New Zealand,Corporate,Sales,GL 6210,Channel Marketing,[SYNTHETIC EVALUATION DATA] ANZ rental fleet safety briefing,15320.00,SUP-588,INV-CLN-3019,APR-2026-119,H. Park,MKT-2026-14',
  'TX-CLN-020,2026-09-27,Q3 2026,North America,Plant 2,Operations,GL 5120,Tooling & Consumables,[SYNTHETIC EVALUATION DATA] Hydraulic hose crimping die set,6840.25,SUP-104,INV-CLN-3020,APR-2026-120,D. Morales,PO-88299',
].join('\n');

export const ANOMALOUS_FINANCIAL_RECORDS_CSV = [
  'transaction_id,posting_date,accounting_period,region,plant,department,gl_account,expense_category,description,amount_cad,supplier_id,invoice_reference,approval_reference,prepared_by,supporting_reference',
  'TX-ANM-001,2026-07-05,Q3 2026,North America,Plant 1,Operations,GL 5110,Direct Materials,[SYNTHETIC EVALUATION DATA] Valid baseline steel tube batch,34200.00,SUP-402,INV-SYN-8801,APR-2026-201,D. Morales,PO-90101',
  'TX-ANM-002,2026-07-09,Q3 2026,North America,Plant 2,Procurement,GL 5115,Fasteners & Hardware,[SYNTHETIC EVALUATION DATA] Valid baseline anchor bolt lot,19850.50,SUP-405,INV-SYN-8802,APR-2026-202,R. Patel,PO-90102',
  'TX-ANM-003,2026-07-12,Q3 2026,Europe,Corporate,Finance,GL 6310,External Audit,[SYNTHETIC EVALUATION DATA] Valid EU statutory filing fee,22400.00,SUP-610,INV-SYN-8803,APR-2026-203,H. Park,ENG-90103',
  'TX-ANM-004,2026-07-16,Q3 2026,North America,Plant 2,Operations,GL 6410,Scrap Write-Off,[SYNTHETIC EVALUATION DATA] ABNORMAL RULE A: High-value assembly write-off >= 250K,275000.00,SUP-410,INV-SYN-8804,APR-2026-204,D. Morales,JE-90104',
  'TX-ANM-005,2026-07-20,Q3 2026,Asia,Corporate,Sales,GL 6210,Channel Marketing,[SYNTHETIC EVALUATION DATA] Valid Asia trade exhibition support,18600.00,SUP-515,INV-SYN-8805,APR-2026-205,K. Takahashi,MKT-90105',
  'TX-ANM-006,2026-07-24,Q3 2026,North America,Plant 1,Logistics,GL 5410,Freight Out,[SYNTHETIC EVALUATION DATA] Valid scheduled outbound carrier run,27900.00,SUP-309,INV-SYN-8806,APR-2026-206,M. Silva,BOL-90106',
  'TX-ANM-007,2026-07-29,Q3 2026,Asia,Corporate,Sales,GL 6250,Consulting Services,[SYNTHETIC EVALUATION DATA] ABNORMAL RULE B: Unbudgeted consulting fee with missing approval,82000.00,SUP-590,INV-SYN-8807,,R. SalesMgr,NO-PO-REF',
  'TX-ANM-008,2026-08-04,Q3 2026,South America,Corporate,Procurement,GL 5210,Component Sourcing,[SYNTHETIC EVALUATION DATA] Valid wiring assembly shipment,31450.25,SUP-542,INV-SYN-8808,APR-2026-208,C. Mendoza,PO-90108',
  'TX-ANM-009,2026-08-08,Q3 2026,North America,Plant 1,Operations,GL 5130,Preventive Maintenance,[SYNTHETIC EVALUATION DATA] Valid crane inspection service,14200.00,SUP-119,INV-SYN-8809,APR-2026-209,D. Morales,WO-90109',
  'TX-ANM-010,2026-08-12,Q3 2026,Australia and New Zealand,Corporate,Logistics,GL 5410,Freight Out,[SYNTHETIC EVALUATION DATA] Valid container drayage charge,19300.00,SUP-322,INV-SYN-8810,APR-2026-210,M. Silva,BOL-90110',
  'TX-ANM-011,2026-08-18,Q3 2026,Europe,Plant 1,Procurement,GL 5210,Direct Materials,[SYNTHETIC EVALUATION DATA] ABNORMAL RULE C: Original steel plate invoice (duplicate test),48200.00,SUP-401,INV-SYN-8840,APR-2026-211,AP Clerk,PO-90111',
  'TX-ANM-012,2026-08-21,Q3 2026,Europe,Plant 1,Procurement,GL 5210,Direct Materials,[SYNTHETIC EVALUATION DATA] ABNORMAL RULE C: Re-keyed -A suffix invoice matching SUP-401 amount,48200.00,SUP-401,INV-SYN-8840-A,APR-2026-212,AP Clerk,PO-90111',
  'TX-ANM-013,2026-08-25,Q3 2026,North America,Plant 2,Operations,GL 5140,Quality Inspection,[SYNTHETIC EVALUATION DATA] Valid metallurgy lab testing fee,12800.00,SUP-182,INV-SYN-8813,APR-2026-213,D. Morales,QC-90113',
  'TX-ANM-014,2026-08-29,Q3 2026,North America,Corporate,Customs and Trade,GL 5430,Brokerage Retainer,[SYNTHETIC EVALUATION DATA] Valid tariff classification review,8900.00,SUP-705,INV-SYN-8814,APR-2026-214,M. Silva,RET-90114',
  'TX-ANM-015,2026-09-03,Q3 2026,North America,Plant 1,Operations,GL 5120,Tooling & Consumables,[SYNTHETIC EVALUATION DATA] Valid welding wire batch (first TX-ANM-015),24600.00,SUP-108,INV-SYN-8815,APR-2026-215,D. Morales,PO-90115',
  'TX-ANM-015,2026-09-03,Q3 2026,North America,Plant 1,Operations,GL 5120,Tooling & Consumables,[SYNTHETIC EVALUATION DATA] ABNORMAL DUPLICATE ID: Repeated transaction_id TX-ANM-015,24600.00,SUP-108,INV-SYN-8816,APR-2026-216,D. Morales,PO-90116',
  'TX-ANM-017,2026-09-10,Q3 2026,Europe,Plant 1,Operations,GL 5150,Utilities & Energy,[SYNTHETIC EVALUATION DATA] Valid regional depot power charge,29400.00,SUP-195,INV-SYN-8817,APR-2026-217,R. Lindqvist,UTL-90117',
  'TX-ANM-018,2026-09-15,Q3 2026,North America,Plant 2,Logistics,GL 7100 SG&A,Rush Freight,[SYNTHETIC EVALUATION DATA] ABNORMAL RULE D: Logistics rush freight coded to SG&A instead of Freight Out,62500.00,SUP-311,INV-SYN-8818,APR-2026-218,Logistics Coord,CAR-90118',
  'TX-ANM-019,2026-09-21,Q3 2026,Corporate,Corporate,Finance,Account 2890,Suspense Clearing,[SYNTHETIC EVALUATION DATA] ABNORMAL RULE D/B: Unmapped suspense balance in Account 2890,85000.00,SUP-999,INV-SYN-8819,Unknown,ERP Batch,BATCH-2890',
  'TX-ANM-020,2026-09-26,Q3 2026,North America,Plant 2,Operations,GL 5110,Direct Materials,[SYNTHETIC EVALUATION DATA] Valid hydraulic tube assembly restock,36750.80,SUP-101,INV-SYN-8820,APR-2026-220,D. Morales,PO-90120',
].join('\n');

// Ensure TX-ANM-007 has valid amount 82000.00 and empty approval_reference!
export const IRRELEVANT_DATA_CSV = [
  'badge_number,employee_shift,cafeteria_meal_plan,parking_lot_zone,locker_id,safety_boot_size',
  'EMP-1001,Day Shift,Plan A,North Lot B,L-012,10.5',
  'EMP-1002,Night Shift,Plan B,South Lot A,L-045,9.0',
  'EMP-1003,Day Shift,Plan A,East Lot C,L-088,11.0',
  'EMP-1004,Swing Shift,None,West Lot D,L-104,8.5',
  'EMP-1005,Day Shift,Plan C,North Lot A,L-119,10.0',
  'EMP-1006,Night Shift,Plan A,South Lot B,L-132,12.0',
  'EMP-1007,Day Shift,Plan B,East Lot A,L-147,9.5',
  'EMP-1008,Swing Shift,Plan A,North Lot C,L-165,10.5',
].join('\n');

export const TEMPLATE_LEDGER_CSV = [
  'transaction_id,posting_date,accounting_period,region,plant,department,gl_account,expense_category,description,amount_cad,supplier_id,invoice_reference,approval_reference,prepared_by,supporting_reference',
  'TX-SAMPLE-001,2026-09-15,Q3 2026,North America,Plant 1,Operations,GL 5110,Direct Materials,Replace with valid transaction description (CAD numeric without currency symbols),12500.00,SUP-100,INV-2026-001,APR-2026-001,Preparer Name,PO-10001',
].join('\n');

export const TEMPLATE_CUSTOMS_CSV = [
  'entry_id,shipment_date,accounting_period,origin_country,destination,goods_description,hs_code,goods_value_cad,base_duty_rate,additional_tariff_rate,actual_duty_cad,actual_broker_fee_cad,trade_agreement,origin_certificate_reference,approval_reference,shipment_reference',
  'E-SAMPLE-001,2026-09-15,Q3 2026,Germany,Guelph,Hydraulic cylinders,8412,500000.00,2.5,0,12500.00,1000.00,None,,APR-TRD-001,BOL-2026-001',
].join('\n');

export const JUDGE_SAMPLE_DATASETS: SampleDatasetSpec[] = [
  {
    id: 'ds-clean',
    fileName: 'Clean_Financial_Records.csv',
    title: 'Dataset 01 · Clean Financial Records (20 Rows)',
    description:
      'Synthetic competition evaluation ledger dataset with 20 valid transactions across regions and departments, all under CAD 250,000 with unique invoices and approval references.',
    expectedOutcomeSummary: 'Expected: 20 Validated · 0 Quarantined · 0 Rejected (all eligible for authorized import)',
    csvContent: CLEAN_FINANCIAL_RECORDS_CSV,
  },
  {
    id: 'ds-anomalous',
    fileName: 'Anomalous_Financial_Records.csv',
    title: 'Dataset 02 · Anomalous Financial Records (20 Rows)',
    description:
      'Controlled mixed-result synthetic ledger dataset containing 13 valid rows plus 7 controlled anomalies: >= CAD 250K (TX-ANM-004), missing approval (TX-ANM-007), -A duplicate invoice pair (TX-ANM-011/012), duplicate ID (TX-ANM-015 row 16), SG&A freight misclassification (TX-ANM-018), and suspense Account 2890 (TX-ANM-019).',
    expectedOutcomeSummary: 'Expected: 13 Validated · 6 Quarantined · 1 Rejected (mixed-result batch)',
    csvContent: ANOMALOUS_FINANCIAL_RECORDS_CSV,
  },
  {
    id: 'ds-irrelevant',
    fileName: 'Irrelevant_Data.csv',
    title: 'Dataset 03 · Irrelevant Facility Data (8 Rows)',
    description:
      'Unrelated synthetic employee badge, cafeteria meal plan, and parking zone table containing zero financial or customs schema fields.',
    expectedOutcomeSummary: 'Expected: Schema Rejected (Unsupported) — zero impact on repository totals',
    csvContent: IRRELEVANT_DATA_CSV,
  },
  {
    id: 'tpl-ledger',
    fileName: 'Template_Ledger_Transactions.csv',
    title: 'Blank Template · Ledger Transactions Schema',
    description: 'Standard CSV header template documenting required and optional Ledger Transaction columns.',
    expectedOutcomeSummary: 'Blank upload template (1 example row)',
    isBlankTemplate: true,
    csvContent: TEMPLATE_LEDGER_CSV,
  },
  {
    id: 'tpl-customs',
    fileName: 'Template_Customs_Shipments.csv',
    title: 'Blank Template · Customs & Shipments Schema',
    description: 'Standard CSV header template documenting required and optional Customs/Shipment columns (rates in percent, e.g., 2.5 for 2.5%).',
    expectedOutcomeSummary: 'Blank upload template (1 example row)',
    isBlankTemplate: true,
    csvContent: TEMPLATE_CUSTOMS_CSV,
  },
];

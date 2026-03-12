/**
 * lib/agent-prompts/v5-test-run.ts
 *
 * Pre-built agent prompt for the Role & Task Matrix V5 end-to-end test run.
 * The agent uses list_report_templates → read_report_template → render_report
 * to populate all 8 slots with AxisTech Group data and publish the finished
 * report to the Custom Reports Library.
 */

export const V5_TEST_PROMPT = `You are being asked to generate the Role & Task Matrix V5 report for AxisTech Group.

Follow these steps precisely:

Step 1: Use list_report_templates to find the "Role & Task Matrix" template.

Step 2: Use read_report_template with include_scaffold: true to fetch the full template definition including all slot definitions and design tokens.

Step 3: Populate each slot with the following AxisTech Group data. Use render_report with this exact slot data:

matrix_title: "Role & Task Matrix"

organisation_name: "AxisTech Group"

version_label: "V5 — March 2026"

entity_definitions: [
  {"code":"axis",   "name":"AxisTech",            "colour":"#34d399","prefix":"AXT",  "fte":12},
  {"code":"proj",   "name":"ProjectCo",            "colour":"#a78bfa","prefix":"PRJ",  "fte":6},
  {"code":"obs",    "name":"ObservationCo",         "colour":"#fbbf24","prefix":"OBS",  "fte":4},
  {"code":"dev",    "name":"DevCo",                 "colour":"#fb923c","prefix":"DEV",  "fte":8},
  {"code":"data",   "name":"DataCo",                "colour":"#38bdf8","prefix":"DAT",  "fte":5},
  {"code":"forge",  "name":"Forge",                 "colour":"#f472b6","prefix":"FRG",  "fte":3},
  {"code":"mkt-ax", "name":"AxisTech Marketing",    "colour":"#f0abfc","prefix":"MKT-A","fte":4},
  {"code":"mkt-gr", "name":"Group Marketing",       "colour":"#c084fc","prefix":"MKT-G","fte":2}
]

column_definitions: [
  {
    "entity_code": "axis",
    "columns": [
      {"code":"end-user","label":"End User / Customer"},
      {"code":"dealer",  "label":"Dealer"}
    ]
  },
  {
    "entity_code": "proj",
    "columns": [
      {"code":"proj-co","label":"AxisTech / ProjectCo"}
    ]
  },
  {
    "entity_code": "dev",
    "columns": [
      {"code":"product","label":"Product Co / Entity"}
    ]
  }
]

section_definitions: [
  {
    "label": "TRANSACTIONAL HARDWARE",
    "rows": [
      {"code":"hw-sales",   "label":"Sales"},
      {"code":"hw-install", "label":"Installation & Commissioning"},
      {"code":"hw-support", "label":"Technical Support"}
    ]
  },
  {
    "label": "ONE-OFF SOFTWARE LICENCE",
    "rows": [
      {"code":"sw-sales",      "label":"Licence Sales"},
      {"code":"sw-onboarding", "label":"Onboarding & Setup"}
    ]
  },
  {
    "label": "RECURRING SAAS",
    "rows": [
      {"code":"saas-acct",    "label":"Account Management"},
      {"code":"saas-support", "label":"Technical Support"},
      {"code":"saas-renew",   "label":"Renewal & Upsell"}
    ]
  },
  {
    "label": "SERVICES",
    "rows": [
      {"code":"svc-consult",  "label":"Consulting"},
      {"code":"svc-training", "label":"Training & Enablement"},
      {"code":"svc-manage",   "label":"Managed Services"}
    ]
  }
]

role_data: {
  "hw-sales-end-user":   [{"entity":"axis","title":"Account Executive","initials":["AE"],"note":"Primary customer contact","badges":["CRM","Quotes"]}],
  "hw-sales-dealer":     [{"entity":"axis","title":"Channel Manager","initials":["CM"],"badges":["Partner Portal"]}],
  "hw-sales-proj-co":    [{"entity":"proj","title":"Solutions Architect","initials":["SA"],"note":"Pre-sales technical","badges":["Design"]}],
  "hw-sales-product":    [{"entity":"dev","title":"Product Owner","initials":["PO"],"badges":["Roadmap"]}],
  "hw-install-end-user": [{"entity":"proj","title":"Field Engineer","initials":["FE"],"note":"On-site install","badges":["Certs"]}],
  "hw-install-dealer":   [{"entity":"axis","title":"Install Coordinator","initials":["IC"],"badges":["Scheduling"]}],
  "hw-install-proj-co":  [{"entity":"proj","title":"Project Manager","initials":["PM"],"badges":["Gantt","Risk"]}],
  "hw-support-end-user": [{"entity":"obs","title":"Support Engineer","initials":["SE"],"note":"L2 remote support","badges":["Tickets"]}],
  "hw-support-dealer":   [{"entity":"axis","title":"Partner Support","initials":["PS"],"badges":["SLA"]}],
  "sw-sales-end-user":   [{"entity":"axis","title":"Account Executive","initials":["AE"],"badges":["Licensing"]},{"entity":"mkt-ax","title":"Product Marketing","initials":["PM"],"badges":["Collateral"]}],
  "sw-sales-proj-co":    [{"entity":"forge","title":"Licence Engineer","initials":["LE"],"badges":["Keys"]}],
  "sw-sales-product":    [{"entity":"dev","title":"Commercial Manager","initials":["CM"],"badges":["Pricing"]}],
  "sw-onboarding-end-user":[{"entity":"proj","title":"Onboarding Specialist","initials":["OS"],"badges":["Kickoff"]}],
  "sw-onboarding-proj-co":[{"entity":"dev","title":"Integration Lead","initials":["IL"],"badges":["API","SDK"]}],
  "saas-acct-end-user":  [{"entity":"axis","title":"Customer Success Manager","initials":["CSM"],"note":"QBR cadence","badges":["NPS","Health"]}],
  "saas-acct-dealer":    [{"entity":"axis","title":"Partner Success","initials":["PS"],"badges":["MDF"]}],
  "saas-support-end-user":[{"entity":"obs","title":"Platform Support","initials":["PS"],"note":"24/5 coverage","badges":["L1","L2"]}],
  "saas-support-proj-co":[{"entity":"data","title":"Data Analyst","initials":["DA"],"badges":["Dashboards"]}],
  "saas-renew-end-user": [{"entity":"axis","title":"Renewal Manager","initials":["RM"],"badges":["ARR","Churn"]}],
  "saas-renew-product":  [{"entity":"dev","title":"Product Manager","initials":["PM"],"note":"Feature roadmap","badges":["Retention"]}],
  "svc-consult-end-user":[{"entity":"proj","title":"Senior Consultant","initials":["SC"],"badges":["SOW"]}],
  "svc-consult-proj-co": [{"entity":"proj","title":"Engagement Manager","initials":["EM"],"badges":["P&L"]}],
  "svc-training-end-user":[{"entity":"obs","title":"Trainer","initials":["TR"],"badges":["LMS","Certs"]}],
  "svc-training-dealer": [{"entity":"axis","title":"Partner Enablement","initials":["PE"],"badges":["Certification"]}],
  "svc-manage-end-user": [{"entity":"obs","title":"Service Delivery Manager","initials":["SDM"],"note":"Weekly reporting","badges":["ITIL"]}],
  "svc-manage-proj-co":  [{"entity":"data","title":"Ops Analyst","initials":["OA"],"badges":["Monitoring"]}]
}

headcount_summary: [
  {"entity":"axis",   "name":"AxisTech",         "fte":12},
  {"entity":"proj",   "name":"ProjectCo",         "fte":6},
  {"entity":"obs",    "name":"ObservationCo",      "fte":4},
  {"entity":"dev",    "name":"DevCo",              "fte":8},
  {"entity":"data",   "name":"DataCo",             "fte":5},
  {"entity":"forge",  "name":"Forge",              "fte":3},
  {"entity":"mkt-ax", "name":"AxisTech Marketing", "fte":4},
  {"entity":"mkt-gr", "name":"Group Marketing",    "fte":2}
]

Step 4: Use render_report with:
  - template_id: (the ID from Step 1)
  - slot_data: (all 8 slots populated above)
  - report_name: "AXT Role & Task Matrix — V5 March 2026"
  - notes: "Generated by agent from V5 template — AxisTech Group full entity map"

Step 5: Return the report view URL and confirm it was saved to the Custom Reports Library.`

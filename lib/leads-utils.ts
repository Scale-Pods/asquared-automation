export interface RawLeadsResponse {
    intro?: any[];
    intro_uk?: any[];
    follow_up?: any[];
    follow_up_uk?: any[];
    master_leads?: any[];
    leads?: any[];
    nr_wf?: any[];
    followup?: any[];
    nurture?: any[];
    owner_reachout?: any[];
    owner_outreach?: any[];
}

export interface ConsolidatedLead {
    id: string;
    lead_id?: string;
    name: string;
    phone: string;
    email: string;
    replied: string;
    current_loop: string;
    source_loop: string;
    source_table?: string;
    stages_passed: string[];
    stage_data: Record<string, any>;
    created_at: string;
    updated_at: string;
    last_contacted?: string;
    sender_email?: string;
    dropped?: string | boolean;
    collapsed_date?: string;
    email_replied?: string;
    whatsapp_replied?: string;
    "W.P_1 TS"?: string;
    "W.P_2 TS"?: string;
    unsubscribed?: string;
    WP_last_contacted?: string;
    Email_last_contacted?: string;
    [key: string]: any;
}

function getVal(obj: any, keys: string[]) {
    if (!obj) return undefined;
    for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    const normalizedTargetKeys = keys.map(k => k.toLowerCase().replace(/[\s._-]/g, ''));
    for (const actualKey in obj) {
        const normalizedActual = actualKey.toLowerCase().replace(/[\s._-]/g, '');
        if (normalizedTargetKeys.includes(normalizedActual)) {
            return obj[actualKey];
        }
    }
    return undefined;
}

function getWhatsAppHistory(l: any) {
    const history: any = {};
    for (let i = 1; i <= 10; i++) {
        history[`W.P_Replied_${i}`] = getVal(l, [`W.P_Replied ${i}`, `W.P_Replied_${i}`]);
        history[`W.P_FollowUp_${i}`] = getVal(l, [`W.P_FollowUp ${i}`, `W.P_FollowUp_${i}`]);
    }
    return history;
}

function mapIntroLead(l: any, idx: number, prefix: string): ConsolidatedLead {
    const stages: string[] = [];
    const stage_data: Record<string, any> = {};

    ["Email_1", "Email_2", "Email_3"].forEach((key) => {
        const val = l[key];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
            stages.push(key);
            stage_data[key] = val;
        }
    });

    const wpKeys = ["W.P_1", "W.P_2"];
    wpKeys.forEach((key, i) => {
        const val = getVal(l, [key]);
        if (val) {
            const stageName = `WhatsApp ${i + 1}`;
            stages.push(stageName);
            stage_data[stageName] = val;
        }
    });

    const others = ["Voice 1", "Voice 2", "FollowUp 48 Hr"];
    others.forEach(key => {
        const val = getVal(l, [key]);
        if (val) {
            stages.push(key);
            stage_data[key] = val;
        }
    });

    return {
        id: `${prefix}-${getVal(l, ["Lead ID", "id"]) || idx}`,
        lead_id: getVal(l, ["Lead ID"]),
        name: String(getVal(l, ["Name"]) || "Lead"),
        phone: String(getVal(l, ["Phone"]) || ""),
        email: String(getVal(l, ["Email"]) || "No Email"),
        replied: String(getVal(l, ["Replied", "W.P_Replied"]) || "No"),
        current_loop: "Intro",
        source_loop: "Intro",
        source_table: prefix,
        stages_passed: stages,
        stage_data,
        created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
        updated_at: getVal(l, ["Updated At", "updated_at"]),
        last_contacted: getVal(l, ["Last Contacted", "last_contacted", "WP_last_contacted", "Email_last_contacted"]),
        sender_email: getVal(l, ["Senders email", "sender_email"]),
        email_replied: l["Email_Replied"] ?? null,
        whatsapp_replied: getVal(l, ["W.P_Replied", "Replied", "whatsapp_replied"]),
        "W.P_1": getVal(l, ["W.P_1", "WhatsApp 1", "WhatsApp_1", "W.P_FollowUp"]),
        "W.P_2": getVal(l, ["W.P_2", "WhatsApp 2"]),
        "W.P_3": getVal(l, ["W.P_3", "WhatsApp 3"]),
        "W.P_4": getVal(l, ["W.P_4", "WhatsApp 4"]),
        "W.P_FollowUp": getVal(l, ["W.P_FollowUp"]),
        "W.P_Replied": getVal(l, ["W.P_Replied", "whatsapp_replied"]),
        "W.P_1 TS": getVal(l, ["W.P_1 TS", "WhatsApp 1 TS", "W.P_FollowUp TS", "WP_FollowUp TS"]),
        "W.P_2 TS": getVal(l, ["W.P_2 TS", "WhatsApp 2 TS"]),
        unsubscribed: getVal(l, ["Unsubscribed", "Unsubscribed text"]) || "No",
        WP_Replied_track: getVal(l, ["WP_Replied_track"]) || null,
        WP_last_contacted: getVal(l, ["WP_last_contacted"]),
        Email_last_contacted: getVal(l, ["Email_last_contacted"]),
        ...getWhatsAppHistory(l)
    };
}

function mapFollowUpLead(l: any, idx: number, prefix: string): ConsolidatedLead {
    const stages: string[] = [];
    const stage_data: Record<string, any> = {};

    for (let i = 1; i <= 3; i++) {
        const key = `Email_${i}`;
        const val = l[key];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
            stages.push(key);
            stage_data[key] = val;
        }
    }

    const others = ["Voice 1", "Voice 2", "FollowUp 48 Hr"];
    others.forEach(key => {
        const val = getVal(l, [key]);
        if (val) {
            stages.push(key);
            stage_data[key] = val;
        }
    });

    const wpVal = getVal(l, ["W.P_FollowUp"]);
    if (wpVal) {
        stages.push("WhatsApp FollowUp");
        stage_data["WhatsApp FollowUp"] = wpVal;
    }

    return {
        id: `${prefix}-${getVal(l, ["Lead ID", "id"]) || idx}`,
        lead_id: getVal(l, ["Lead ID"]),
        name: String(getVal(l, ["Name"]) || "Lead"),
        phone: String(getVal(l, ["Phone"]) || ""),
        email: String(getVal(l, ["Email"]) || "No Email"),
        replied: String(getVal(l, ["Replied", "Email_Replied"]) || "No"),
        current_loop: "Follow Up",
        source_loop: "Follow Up",
        source_table: prefix,
        stages_passed: stages,
        stage_data,
        created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
        updated_at: getVal(l, ["Updated At", "updated_at"]),
        last_contacted: getVal(l, ["Last Contacted", "last_contacted", "WP_last_contacted", "Email_last_contacted"]),
        dropped: getVal(l, ["Dropped"]),
        sender_email: getVal(l, ["Senders email"]),
        email_replied: l["Email_Replied"] ?? null,
        whatsapp_replied: getVal(l, ["W.P_Replied", "Replied", "whatsapp_replied"]),
        "W.P_1": getVal(l, ["W.P_1", "WhatsApp 1", "WhatsApp_1", "W.P_FollowUp"]),
        "W.P_2": getVal(l, ["W.P_2", "WhatsApp 2"]),
        "W.P_3": getVal(l, ["W.P_3", "WhatsApp 3"]),
        "W.P_4": getVal(l, ["W.P_4", "WhatsApp 4"]),
        "W.P_FollowUp": getVal(l, ["W.P_FollowUp"]),
        "W.P_Replied": getVal(l, ["W.P_Replied", "whatsapp_replied"]),
        "W.P_1 TS": getVal(l, ["W.P_1 TS", "W.P_1  TS", "WhatsApp 1 TS", "W.P_FollowUp TS", "WP_FollowUp TS"]),
        "W.P_2 TS": getVal(l, ["W.P_2 TS", "WhatsApp 2 TS"]),
        "W.P_3 TS": getVal(l, ["W.P_3 TS"]),
        "W.P_4 TS": getVal(l, ["W.P_4 TS"]),
        unsubscribed: getVal(l, ["Unsubscribed", "Unsubscribed text"]) || "No",
        WP_Replied_track: getVal(l, ["WP_Replied_track"]) || null,
        WP_last_contacted: getVal(l, ["WP_last_contacted"]),
        Email_last_contacted: getVal(l, ["Email_last_contacted"]),
        ...getWhatsAppHistory(l)
    };
}

export function consolidateLeads(data: RawLeadsResponse): ConsolidatedLead[] {
    const consolidatedLeads: ConsolidatedLead[] = [];

    if (Array.isArray(data.intro)) {
        data.intro.forEach((l: any, idx: number) => {
            consolidatedLeads.push(mapIntroLead(l, idx, "intro"));
        });
    }

    if (Array.isArray(data.intro_uk)) {
        data.intro_uk.forEach((l: any, idx: number) => {
            consolidatedLeads.push(mapIntroLead(l, idx, "intro_uk"));
        });
    }

    if (Array.isArray(data.follow_up)) {
        data.follow_up.forEach((l: any, idx: number) => {
            consolidatedLeads.push(mapFollowUpLead(l, idx, "follow_up"));
        });
    }

    if (Array.isArray(data.follow_up_uk)) {
        data.follow_up_uk.forEach((l: any, idx: number) => {
            consolidatedLeads.push(mapFollowUpLead(l, idx, "follow_up_uk"));
        });
    }

    if (Array.isArray(data.master_leads)) {
        data.master_leads.forEach((l: any, idx: number) => {
            consolidatedLeads.push({
                id: `master-${getVal(l, ["master_leads_id", "id"]) || idx}`,
                name: String(getVal(l, ["Owner Name", "Name", "name"]) || "Lead"),
                phone: String(getVal(l, ["Contact Number", "Phone", "phone", "phoneNumber", "customer_number"]) || ""),
                email: String(getVal(l, ["Email", "email"]) || "No Email"),
                replied: "No",
                current_loop: "Master",
                source_loop: "Master Leads",
                source_table: "master_leads",
                stages_passed: [],
                stage_data: {},
                created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
                updated_at: getVal(l, ["Updated At", "updated_at"]),
                last_contacted: getVal(l, ["Last Contacted", "last_contacted"]),
                lead_status: getVal(l, ["lead_status", "Lead Status"]),
                voice_call_status: getVal(l, ["voice_call_status"]),
                note: getVal(l, ["note"])
            });
        });
    }

    if (Array.isArray(data.leads) && data.leads.length > 0) {
        data.leads.forEach((l: any, idx: number) => {
            consolidatedLeads.push({
                id: `leads-${l.id || idx}`,
                lead_id: l.bitrix_lead_id || "",
                name: String(l.name || l.customer_name || "Lead"),
                phone: String(l.phone || ""),
                email: String(l.email || "No Email"),
                replied: l.response_received ? "Yes" : "No",
                current_loop: l.current_loop || "Master",
                source_loop: l.current_loop || "Master",
                source_table: l.source ? `leads-${l.source}` : "leads",
                stages_passed: [],
                stage_data: {},
                created_at: l.created_at || new Date().toISOString(),
                updated_at: l.updated_at || undefined,
                last_contacted: l.last_outreach_at || undefined,
                lead_status: l.lead_status || l.status || undefined,
                description: l.description || undefined,
                is_active: l.is_active ?? true
            });
        });
    }

    return consolidatedLeads;
}

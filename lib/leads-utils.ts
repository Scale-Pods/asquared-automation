export interface RawLeadsResponse {
    nr_wf: any[];
    followup: any[];
    nurture: any[];
    master_leads?: any[];
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
    stages_passed: string[];
    stage_data: Record<string, any>; // Stores raw column values for each stage
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

export function consolidateLeads(data: RawLeadsResponse): ConsolidatedLead[] {
    const consolidatedLeads: ConsolidatedLead[] = [];

    // 1. Map nr_wf (Intro Loop)
    if (Array.isArray(data.nr_wf)) {
        data.nr_wf.forEach((l: any, idx: number) => {
            const stages: string[] = [];
            const stage_data: Record<string, any> = {};

            // Direct access — no getVal normalization, read ONLY Email_1/2/3 underscore columns
            ["Email_1", "Email_2", "Email_3"].forEach((key) => {
                const val = l[key]; // direct property access — no fallback to "Email 1"
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                    stages.push(key);          // stage name = "Email_1" (matches column)
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

            consolidatedLeads.push({
                id: `intro-${getVal(l, ["Lead ID", "id"]) || idx}`,
                lead_id: getVal(l, ["Lead ID"]),
                name: String(getVal(l, ["Name"]) || "Lead"),
                phone: String(getVal(l, ["Phone"]) || ""),
                email: String(getVal(l, ["Email"]) || "No Email"),
                replied: String(getVal(l, ["Replied", "W.P_Replied"]) || "No"),
                current_loop: "Intro",
                source_loop: "Intro",
                stages_passed: stages,
                stage_data,
                created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
                updated_at: getVal(l, ["Updated At", "updated_at"]),
                last_contacted: getVal(l, ["Last Contacted", "last_contacted"]),
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
                ...getWhatsAppHistory(l)
            });
        });
    }

    // 2. Map followup (Follow Up Loop)
    if (Array.isArray(data.followup)) {
        data.followup.forEach((l: any, idx: number) => {
            const stages: string[] = [];
            const stage_data: Record<string, any> = {};

            // Direct access — read ONLY Email_1/2/3 underscore columns from followup
            for (let i = 1; i <= 3; i++) {
                const key = `Email_${i}`;
                const val = l[key]; // direct — no normalization fallback
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                    stages.push(key);          // stage name = "Email_1" etc.
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

            consolidatedLeads.push({
                id: `followup-${getVal(l, ["Lead ID", "id"]) || idx}`,
                lead_id: getVal(l, ["Lead ID"]),
                name: String(getVal(l, ["Name"]) || "Lead"),
                phone: String(getVal(l, ["Phone"]) || ""),
                email: String(getVal(l, ["Email"]) || "No Email"),
                replied: String(getVal(l, ["Replied", "Email_Replied"]) || "No"),
                current_loop: "Follow Up",
                source_loop: "Follow Up",
                stages_passed: stages,
                stage_data,
                created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
                updated_at: getVal(l, ["Updated At", "updated_at"]),
                last_contacted: getVal(l, ["Last Contacted"]),
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
                ...getWhatsAppHistory(l)
            });
        });
    }

    // 3. Map nurture (Nurture Loop)
    if (Array.isArray(data.nurture)) {
        data.nurture.forEach((l: any, idx: number) => {
            const stages: string[] = [];
            const stage_data: Record<string, any> = {};

            // Direct access — read ONLY Email_1 through Email_9 underscore columns from nurture
            for (let i = 1; i <= 9; i++) {
                const key = `Email_${i}`;
                const val = l[key]; // direct — no normalization fallback
                if (val !== undefined && val !== null && String(val).trim() !== "") {
                    stages.push(key);          // stage name = "Email_1" etc.
                    stage_data[key] = val;
                }
            }

            for (let i = 1; i <= 6; i++) {
                const val = getVal(l, [`W.P_${i}`]);
                if (val) {
                    const stageName = `WhatsApp ${i}`;
                    stages.push(stageName);
                    stage_data[stageName] = val;
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

            const wpFollowVal = getVal(l, ["W.P_FollowUp"]);
            if (wpFollowVal) {
                stages.push("WhatsApp FollowUp");
                stage_data["WhatsApp FollowUp"] = wpFollowVal;
            }

            let currentWeek = "";
            if (getVal(l, ["Week 1"])) currentWeek = "Week 1";
            if (getVal(l, ["Week 2"])) currentWeek = "Week 2";
            if (getVal(l, ["Week 3"])) currentWeek = "Week 3";

            consolidatedLeads.push({
                id: `nurture-${getVal(l, ["Lead ID", "id"]) || idx}`,
                lead_id: getVal(l, ["Lead ID"]),
                name: String(getVal(l, ["Name"]) || "Lead"),
                phone: String(getVal(l, ["Phone"]) || ""),
                email: String(getVal(l, ["Email"]) || "No Email"),
                replied: String(getVal(l, ["Replied", "Email_Replied", "W.P_Replied"]) || "No"),
                current_loop: "Nurture",
                source_loop: "Nurture Loop",
                stages_passed: stages,
                stage_data,
                current_week: currentWeek,
                created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
                updated_at: getVal(l, ["Updated At", "updated_at"]),
                last_contacted: getVal(l, ["Last Contacted"]),
                dropped: getVal(l, ["Dropped"]),
                sender_email: getVal(l, ["Senders email"]),
                email_replied: l["Email_Replied"] ?? null,
                whatsapp_replied: getVal(l, ["W.P_Replied", "Replied", "whatsapp_replied"]),
                "W.P_1": getVal(l, ["W.P_1", "WhatsApp 1", "WhatsApp_1", "W.P_FollowUp"]),
                "W.P_2": getVal(l, ["W.P_2", "WhatsApp 2"]),
                "W.P_3": getVal(l, ["W.P_3", "WhatsApp 3"]),
                "W.P_4": getVal(l, ["W.P_4", "WhatsApp 4"]),
                "W.P_5": getVal(l, ["W.P_5", "WhatsApp 5"]),
                "W.P_6": getVal(l, ["W.P_6", "WhatsApp 6"]),
                "W.P_7": getVal(l, ["W.P_7"]),
                "W.P_8": getVal(l, ["W.P_8"]),
                "W.P_9": getVal(l, ["W.P_9"]),
                "W.P_10": getVal(l, ["W.P_10"]),
                "W.P_11": getVal(l, ["W.P_11"]),
                "W.P_12": getVal(l, ["W.P_12"]),
                "W.P_FollowUp": getVal(l, ["W.P_FollowUp"]),
                "W.P_Replied": getVal(l, ["W.P_Replied", "whatsapp_replied"]),
                "W.P_1 TS": getVal(l, ["W.P_1 TS", "WhatsApp 1 TS", "W.P_FollowUp TS", "WP_FollowUp TS"]),
                "W.P_2 TS": getVal(l, ["W.P_2 TS", "WhatsApp 2 TS"]),
                "W.P_3 TS": getVal(l, ["W.P_3 TS"]),
                "W.P_4 TS": getVal(l, ["W.P_4 TS"]),
                "W.P_5 TS": getVal(l, ["W.P_5 TS"]),
                "W.P_6 TS": getVal(l, ["W.P_6 TS"]),
                unsubscribed: getVal(l, ["Unsubscribed", "Unsubscribed text"]) || "No",
                WP_Replied_track: getVal(l, ["WP_Replied_track"]) || null,
                ...getWhatsAppHistory(l)
            });
        });
    }

    // 4. Map master_leads
    if (Array.isArray((data as any).master_leads)) {
        (data as any).master_leads.forEach((l: any, idx: number) => {
            consolidatedLeads.push({
                id: `master-${getVal(l, ["master_leads_id", "id"]) || idx}`,
                name: String(getVal(l, ["Owner Name", "Name", "name"]) || "Lead"),
                phone: String(getVal(l, ["Contact Number", "Phone", "phone", "phoneNumber", "customer_number"]) || ""),
                email: String(getVal(l, ["Email", "email"]) || "No Email"),
                replied: "No",
                current_loop: "Master",
                source_loop: "Master Leads",
                stages_passed: [],
                stage_data: {},
                created_at: getVal(l, ["Created At", "created_at"]) || new Date().toISOString(),
                updated_at: getVal(l, ["Updated At", "updated_at"]),
                lead_status: getVal(l, ["lead_status", "Lead Status"]),
                voice_call_status: getVal(l, ["voice_call_status"]),
                note: getVal(l, ["note"])
            });
        });
    }

    return consolidatedLeads;
}

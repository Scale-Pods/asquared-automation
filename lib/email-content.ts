
export const fetchEmailTemplates = async () => {
    try {
        const res = await fetch('/api/templates');
        if (!res.ok) throw new Error("Failed to fetch templates");
        const templates = await res.json();
        return templates;
    } catch (e) {
        console.error("Error loading email templates", e);
        return [];
    }
};

/**
 * Maps sequential email stage names (e.g., Email 4) 
 * back to their loop-specific template names (e.g., Email 1 in Follow-up)
 */
function getTemplateKeyAndLoop(stage: string) {
    const match = stage.match(/Email (\d+)/i);
    if (!match) return { key: stage, loop: null };

    const num = parseInt(match[1]);

    // Intro: 1, 2, 3
    if (num <= 3) return { key: `Email ${num}`, loop: "Intro" };

    // Follow-up: 4, 5, 6 -> map to 1, 2, 3
    if (num <= 6) return { key: `Email ${num - 3}`, loop: "Follow Up" };

    // Nurture: 7, 8, 9... -> map to 1, 2, 3...
    return { key: `Email ${num - 6}`, loop: "Nurture" };
}

export const getEmailDetails = async (stage: string, leadName: string = "Valued Client") => {
    const allTemplates = await fetchEmailTemplates();
    return getEmailDetailsFromTemplates(stage, leadName, allTemplates);
};

export const getEmailDetailsFromTemplates = (stage: string, leadName: string = "Valued Client", allTemplates: any[]) => {
    const { key, loop } = getTemplateKeyAndLoop(stage);

    // Find template by name and optionally loop (category)
    let template = allTemplates.find((t: any) =>
        t.type === 'email' &&
        (t.name === key || (loop && t.name === key && t.category === loop))
    );

    // If loop-specific match failed, try just name match
    if (!template) {
        template = allTemplates.find((t: any) => t.type === 'email' && t.name === key);
    }

    // Last resort fallback for stage including name
    if (!template) {
        template = allTemplates.find((t: any) => t.type === 'email' && stage.includes(t.name));
    }

    if (template) {
        const agentName = process.env.NEXT_PUBLIC_AGENT_NAME || "Adnan Shaikh";

        // Replace placeholders from the fetched content
        let processedContent = (template.content || template.body || "")
            .replace(/\{\{\s*\$json\.Name\s*\}\}/gi, leadName)
            .replace(/\{\{\s*Name\s*\}\}/gi, leadName)
            .replace(/\[Name\]/gi, leadName)
            .replace(/\{\{\s*Agent\s*Name\s*\}\}/gi, agentName)
            .replace(/\[Agent Name\]/gi, agentName)
            .replace(/\{\{\s*BD_Name\s*\}\}/gi, agentName);

        // Prettify Content
        processedContent = processedContent.replace(/\.([A-Z])/g, '. $1');
        processedContent = processedContent.replace(/(^(?:Hi|Hello|Dear)\s+[^,\n]+[,:])([^\n])/gi, '$1\n\n$2');

        const closings = ["Best,", "Regards,", "Cheers,", "Warm regards,", "Sincerely,"];
        closings.forEach(closing => {
            const rePre = new RegExp(`([^\\n])\\s*(${closing})`, 'gi');
            processedContent = processedContent.replace(rePre, '$1\n\n$2');

            const rePost = new RegExp(`(${closing})\\s*([^\\n])`, 'gi');
            processedContent = processedContent.replace(rePost, '$1\n$2');
        });

        processedContent = processedContent.replace(/([a-zA-Z])(Asquared Real Estate)/g, '$1\n$2');
        processedContent = processedContent.replace(/([a-zA-Z])(Sent from my iPhone)/g, '$1\n$2');

        const processedSubject = (template.subject || "No Subject")
            .replace(/\{\{\s*\$json\.Name\s*\}\}/gi, leadName)
            .replace(/\{\{\s*Name\s*\}\}/gi, leadName)
            .replace(/\[Name\]/gi, leadName);

        return {
            subject: processedSubject,
            content: processedContent,
            loop: template.category ? template.category.replace(" Loop", "") : (loop || "Intro")
        };
    }

    return {
        subject: `Outreach: ${stage}`,
        content: "Content not available in current data view. Template mapping might need adjustment.",
        loop: loop || "Unknown"
    };
};


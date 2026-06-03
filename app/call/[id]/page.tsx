import { Metadata } from "next";
import PublicCallView from "./public-call-view";

export const metadata: Metadata = {
    title: "Call Details | Asquared",
    description: "Shared call recording and transcript",
};

export default async function PublicCallPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <PublicCallView callId={id} />;
}

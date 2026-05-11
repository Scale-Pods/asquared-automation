import * as React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function calculateDuration(call: any): number {
    let seconds = 0;

    // Check all possible duration fields
    if (typeof call.call_duration_secs === 'number') seconds = call.call_duration_secs;
    else if (typeof call.durationSeconds === 'number') seconds = call.durationSeconds;
    else if (typeof call.duration === 'number') seconds = call.duration;

    if (seconds === 0 && (call.endedAt || call.end_time_unix_secs) && (call.startedAt || call.start_time_unix_secs)) {
        const start = call.start_time_unix_secs ? call.start_time_unix_secs * 1000 : (call.startedAt ? new Date(call.startedAt).getTime() : null);
        const end = call.end_time_unix_secs ? call.end_time_unix_secs * 1000 : (call.endedAt ? new Date(call.endedAt).getTime() : null);

        if (start && end && !isNaN(start) && !isNaN(end)) {
            seconds = (end - start) / 1000;
        }
    }

    // If call is active
    if (seconds === 0 && (call.status === 'active' || call.status === 'in-progress')) {
        const start = call.start_time_unix_secs ? call.start_time_unix_secs * 1000 : (call.startedAt ? new Date(call.startedAt).getTime() : null);
        if (start) {
            seconds = (Date.now() - start) / 1000;
        }
    }

    return Math.max(0, seconds);
}

export function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
}

export function formatIncident(s: string) : string {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const hasTime = s.includes('T');
    return d.toLocaleString("th-TH" , hasTime 
        ? { dateStyle: "medium", timeStyle: "short" } 
        : { dateStyle: "medium" }
    );
}
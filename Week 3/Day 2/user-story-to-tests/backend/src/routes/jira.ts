import express from 'express'
import fetch from 'node-fetch'
import { JiraConfigSchema } from '../schemas'

export const jiraRouter = express.Router()

// Helper to flatten Jira's rich text description (ADF format) to plain text
function flattenDescription(desc: any): string {
    if (typeof desc === 'string') return desc
    if (!desc || typeof desc !== 'object') return ''

    // desc is likely a Document object with content array
    if (Array.isArray(desc.content)) {
        return desc.content
            .map((block: any) => {
                if (block.type === 'paragraph' && Array.isArray(block.content)) {
                    return block.content.map((inline: any) => inline.text || '').join('')
                }
                // handle headings or other text container types
                if (Array.isArray(block.content)) {
                    return block.content.map((inline: any) => inline.text || '').join('')
                }
                return ''
            })
            .filter(Boolean)
            .join('\n')
    }
    // fallback: if object contains text-like properties
    if (typeof desc.plainText === 'string') return desc.plainText
    return ''
}

function extractTextFromField(val: any): string {
    if (typeof val === 'string') return val
    if (!val || typeof val !== 'object') return ''

    if (val.type === 'doc' || Array.isArray(val.content)) return flattenDescription(val)
    if (typeof val.value === 'string') return val.value
    if (typeof val.plainText === 'string') return val.plainText
    if (typeof val.name === 'string') return val.name
    if (typeof val.displayName === 'string') return val.displayName

    // Try to stringify short text from nested content
    try {
        const str = JSON.stringify(val)
        // avoid returning large JSON blobs as text
        if (str.length < 1000) return str
    } catch (e) {
        // ignore
    }
    return ''
}

function parseAcceptanceField(val: any): string {
    if (!val) return ''

    // If it's a string, maybe it's JSON encoded (observed in some Jira instances)
    if (typeof val === 'string') {
        const trimmed = val.trim()
        if (!trimmed) return ''
        try {
            const parsed = JSON.parse(trimmed)
            // If parsed is an array, try to pull summaries or names
            if (Array.isArray(parsed)) {
                const parts: string[] = []
                for (const item of parsed) {
                    if (!item) continue
                    if (item.fields && item.fields.summary) parts.push(String(item.fields.summary))
                    else if (item.summary) parts.push(String(item.summary))
                    else if (item.name) parts.push(String(item.name))
                    else if (typeof item === 'string') parts.push(item)
                }
                return parts.join('\n\n')
            }

            // If parsed is an object, look for nested fields.summary, comments, name, or a body
            if (typeof parsed === 'object') {
                if (parsed.fields && parsed.fields.summary) return String(parsed.fields.summary)
                if (parsed.summary) return String(parsed.summary)
                if (parsed.name) return String(parsed.name)
                if (parsed.comments && Array.isArray(parsed.comments) && parsed.comments.length > 0) {
                    const comments = parsed.comments.map((c: any) => extractTextFromField(c.body) || c.body || '').filter(Boolean)
                    return comments.join('\n\n')
                }
                // fallback: try to extract text from object
                const txt = extractTextFromField(parsed)
                if (txt) return txt
            }
        } catch (e) {
            // not JSON — fall through to return string
        }

        return trimmed
    }

    // If it's already an object/ADF structure, try extracting text
    return extractTextFromField(val)
}

jiraRouter.post('/stories', async (req: express.Request, res: express.Response): Promise<void> => {
    try {
        // validate request body
        const validation = JiraConfigSchema.safeParse(req.body)
        if (!validation.success) {
            res.status(400).json({ error: validation.error.message })
            return
        }

        const { baseUrl, email, token } = validation.data

        // Use REST API v3 search/jql endpoint and request all fields (including custom fields)
        const url = `${baseUrl.replace(/\/+$/, '')}/rest/api/3/search/jql`
        const auth = Buffer.from(`${email}:${token}`).toString('base64')

        // First fetch field metadata so we can map customfield IDs to human names
        let acceptanceFieldId: string | null = null
        try {
            const fieldsMetaUrl = `${baseUrl.replace(/\/+$/, '')}/rest/api/3/field`
            const fieldsMetaResp = await fetch(fieldsMetaUrl, {
                method: 'GET',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Accept': 'application/json'
                }
            })
            if (fieldsMetaResp.ok) {
                const fieldsMeta = await fieldsMetaResp.json()
                // Find a field whose name suggests acceptance criteria
                const match = (fieldsMeta || []).find((f: any) => /accept|criteria/i.test(String(f.name || '')))
                if (match && match.id) {
                    acceptanceFieldId = match.id
                    console.log('[JIRA DEBUG] Detected acceptance criteria field:', acceptanceFieldId, match.name)
                } else {
                    console.log('[JIRA DEBUG] No acceptance criteria field detected in metadata')
                }
            } else {
                const txt = await fieldsMetaResp.text().catch(() => '')
                console.log('[JIRA DEBUG] Failed to fetch field metadata:', fieldsMetaResp.status, txt)
            }
        } catch (e) {
            console.log('[JIRA DEBUG] Error fetching field metadata', e)
        }

        const apiResp = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                jql: 'project is not EMPTY',
                maxResults: 50,
                fields: ['*all']
            })
        })

        if (!apiResp.ok) {
            const txt = await apiResp.text().catch(() => '')
            res.status(apiResp.status).json({ error: `Jira API error ${apiResp.status}: ${txt}` })
            return
        }

        const data = await apiResp.json() as any

        // Log top-level response size and first issue for debugging
        console.log('[JIRA DEBUG] total issues returned:', Array.isArray(data.issues) ? data.issues.length : 0)
        if (data.issues && data.issues.length > 0) {
            console.log('[JIRA DEBUG] Raw first issue JSON:')
            try { console.log(JSON.stringify(data.issues[0], null, 2)) } catch (e) { console.log(data.issues[0]) }
        }

        // Exclude issues whose key starts with 'SCRUM' (case-insensitive)
        const excludedKeys: string[] = []
        const filteredIssues = (data.issues || []).filter((issue: any) => {
            const k = String(issue.key || '').toLowerCase()
            if (k.startsWith('scrum')) {
                excludedKeys.push(issue.key || issue.id)
                return false
            }
            return true
        })

        if (excludedKeys.length > 0) console.log('[JIRA DEBUG] Excluding issues with keys:', excludedKeys)

        const mapped = filteredIssues.map((issue: any) => {
            const fields = issue.fields || {}
            const summary = issue.summary || fields.summary || ''
            const description = extractTextFromField(issue.description || fields.description) || ''

            // Gather candidate texts from fields (excluding summary/description)
            const fieldNames = Object.keys(fields)
            const candidates: Array<{ key: string; text: string }> = []
            for (const k of fieldNames) {
                if (k === 'summary' || k === 'description') continue
                const txt = extractTextFromField(fields[k])
                if (txt && txt.trim().length > 0) candidates.push({ key: k, text: txt.trim() })
            }

            // Prefer a field whose key/name suggests acceptance criteria
            let acceptance = ''
            let chosenField = ''
            // If we detected a metadata field id, prefer that
            if (!acceptance && acceptanceFieldId && fields[acceptanceFieldId]) {
                const txt = extractTextFromField(fields[acceptanceFieldId])
                if (txt && txt.trim().length > 0) {
                    acceptance = txt.trim()
                    chosenField = acceptanceFieldId
                }
            }
            const lowerNames = fieldNames.map(n => n.toLowerCase())
            // direct key
            for (const c of candidates) {
                const nk = c.key.toLowerCase()
                if (nk.includes('accept') || nk.includes('criteria')) {
                    acceptance = c.text
                    chosenField = c.key
                    break
                }
            }

            // fallback: if none matched, pick the longest candidate over a threshold
            if (!acceptance && candidates.length > 0) {
                candidates.sort((a, b) => b.text.length - a.text.length)
                if (candidates[0].text.length >= 20) {
                    acceptance = candidates[0].text
                    chosenField = candidates[0].key
                }
            }

            // Log available fields and chosen mapping for debugging
            const issueKeyForLog = issue.key || issue.id
            console.log('[JIRA DEBUG] issue:', issueKeyForLog, 'availableFields=', fieldNames)
            if (chosenField) console.log('[JIRA DEBUG] chosen acceptance field=', chosenField)

            return {
                id: issue.id,
                key: issue.key,
                summary,
                description,
                acceptanceCriteria: acceptance
            }
        })

        res.json({ issues: mapped })
    } catch (err) {
        console.error('[JIRA ERROR]', err)
        res.status(502).json({ error: (err as Error).message })
    }
})

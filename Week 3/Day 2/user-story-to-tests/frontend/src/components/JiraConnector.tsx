import { useState } from 'react'
import { fetchJiraStories } from '../api'
import type { JiraIssue } from '../types'

interface JiraConfig {
    baseUrl: string
    email: string
    token: string
}

interface Props {
    onStorySelect: (story: { title: string; description?: string; acceptanceCriteria?: string }) => void
}

export function JiraConnector({ onStorySelect }: Props) {
    const [showModal, setShowModal] = useState(false)
    const [config, setConfig] = useState<JiraConfig>({
        baseUrl: '',
        email: '',
        token: ''
    })
    const [stories, setStories] = useState<JiraIssue[] | null>(null)
    const [selectedStory, setSelectedStory] = useState<JiraIssue | null>(null)
    const [acceptanceCriteria, setAcceptanceCriteria] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const openModal = () => setShowModal(true)
    const closeModal = () => {
        setShowModal(false)
        setStories(null)
        setSelectedStory(null)
        setAcceptanceCriteria('')
        setError(null)
    }

    const handleChange = (field: keyof JiraConfig, value: string) => {
        setConfig(prev => ({ ...prev, [field]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        try {
            const data = await fetchJiraStories(config)
            // Normalize response shape: backend may return top-level summary/description/acceptanceCriteria
            const normalized = (data.issues || []).map((i: any) => {
                const fields = i.fields || {}
                return {
                    id: i.id,
                    key: i.key,
                    fields: {
                        summary: i.summary || fields.summary || '',
                        description: i.description || fields.description || '',
                        acceptanceCriteria: i.acceptanceCriteria || fields.acceptanceCriteria || '',
                        ...fields
                    }
                }
            })
            setStories(normalized)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch stories')
        } finally {
            setLoading(false)
        }
    }

    const handleSelect = (issue: JiraIssue) => {
        setSelectedStory(issue)
        // Pre-populate with acceptance criteria from the issue
        const ac = typeof issue.fields.acceptanceCriteria === 'string'
            ? issue.fields.acceptanceCriteria
            : ''
        setAcceptanceCriteria(ac)
    }

    const handleConfirmStory = () => {
        if (!selectedStory) return
        const title = selectedStory.fields.summary || ''
        const description = selectedStory.fields.description || ''
        onStorySelect({ title, description, acceptanceCriteria })
        closeModal()
    }

    return (
        <>
            <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                <button onClick={openModal} className="submit-btn">
                    Connect to Jira
                </button>
            </div>

            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '600px' }}>
                        {stories === null && selectedStory === null ? (
                            // Connection form
                            <form onSubmit={handleSubmit}>
                                <h2>Jira Connection</h2>
                                <div className="form-group">
                                    <label htmlFor="jiraBaseUrl" className="form-label">
                                        Jira Base URL
                                    </label>
                                    <input
                                        id="jiraBaseUrl"
                                        type="text"
                                        className="form-input"
                                        value={config.baseUrl}
                                        onChange={e => handleChange('baseUrl', e.target.value)}
                                        placeholder="https://yourcompany.atlassian.net"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="jiraEmail" className="form-label">
                                        Email
                                    </label>
                                    <input
                                        id="jiraEmail"
                                        type="email"
                                        className="form-input"
                                        value={config.email}
                                        onChange={e => handleChange('email', e.target.value)}
                                        placeholder="you@company.com"
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="jiraToken" className="form-label">
                                        API Token
                                    </label>
                                    <input
                                        id="jiraToken"
                                        type="password"
                                        className="form-input"
                                        value={config.token}
                                        onChange={e => handleChange('token', e.target.value)}
                                        placeholder="xxxxxxxxxxxxxxxx"
                                        required
                                    />
                                </div>

                                {error && <div style={{ color: '#e74c3c', marginBottom: '15px' }}>{error}</div>}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button type="button" className="submit-btn" onClick={closeModal} style={{ background: '#bdc3c7' }}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="submit-btn" disabled={loading}>
                                        {loading ? 'Connecting...' : 'Connect'}
                                    </button>
                                </div>
                            </form>
                        ) : stories !== null && selectedStory === null ? (
                            // Stories list
                            <div>
                                <h2>Select a Story</h2>
                                <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '15px' }}>
                                    {stories.length === 0 ? (
                                        <p>No stories found</p>
                                    ) : (
                                        <ul style={{ listStyle: 'none', padding: 0 }}>
                                            {stories.map(issue => (
                                                <li key={issue.id} style={{ marginBottom: '10px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelect(issue)}
                                                        style={{
                                                            width: '100%',
                                                            padding: '12px',
                                                            textAlign: 'left',
                                                            border: '1px solid #e1e8ed',
                                                            borderRadius: '4px',
                                                            background: 'white',
                                                            cursor: 'pointer',
                                                            transition: 'background-color 0.2s'
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fa')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                                                    >
                                                        <div><strong style={{ color: '#3498db' }}>{issue.key}</strong></div>
                                                        <div style={{ marginTop: '4px', color: '#333' }}>{issue.fields.summary}</div>
                                                        {issue.fields.description && (
                                                            <div style={{ marginTop: '4px', fontSize: '12px', color: '#666', whiteSpace: 'pre-wrap' }}>
                                                                {issue.fields.description.substring(0, 100)}
                                                                {issue.fields.description.length > 100 ? '...' : ''}
                                                            </div>
                                                        )}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button type="button" className="submit-btn" onClick={() => setStories(null)} style={{ background: '#bdc3c7' }}>
                                        Back
                                    </button>
                                </div>
                            </div>
                        ) : selectedStory !== null ? (
                            // Story details with acceptance criteria form
                            <div>
                                <h2>Confirm Story Details</h2>
                                <div className="form-group">
                                    <label className="form-label">Story ID</label>
                                    <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px', color: '#333' }}>
                                        {selectedStory.key}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Title</label>
                                    <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px', color: '#333' }}>
                                        {selectedStory.fields.summary}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '4px', color: '#333', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                                        {selectedStory.fields.description || 'N/A'}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Acceptance Criteria (from Jira)</label>
                                    <div style={{ padding: '10px', background: '#f0f8ff', borderRadius: '4px', color: '#333', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', marginBottom: '12px' }}>
                                        {selectedStory.fields.acceptanceCriteria || '(Not set in Jira)'}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="acriteria" className="form-label">
                                        Acceptance Criteria (Edit if needed)
                                    </label>
                                    <textarea
                                        id="acriteria"
                                        className="form-textarea"
                                        value={acceptanceCriteria}
                                        onChange={e => setAcceptanceCriteria(e.target.value)}
                                        placeholder="Enter acceptance criteria..."
                                        required
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                    <button type="button" className="submit-btn" onClick={() => setSelectedStory(null)} style={{ background: '#bdc3c7' }}>
                                        Back
                                    </button>
                                    <button type="button" className="submit-btn" onClick={handleConfirmStory}>
                                        Use This Story
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
        </>
    )
}

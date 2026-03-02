import { z } from 'zod'

export const GenerateRequestSchema = z.object({
  storyTitle: z.string().min(1, 'Story title is required'),
  acceptanceCriteria: z.string().min(1, 'Acceptance criteria is required'),
  description: z.string().optional(),
  additionalInfo: z.string().optional()
})

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  steps: z.array(z.string()),
  testData: z.string().optional(),
  expectedResult: z.string(),
  category: z.string()
})

export const GenerateResponseSchema = z.object({
  cases: z.array(TestCaseSchema),
  model: z.string().optional(),
  promptTokens: z.number(),
  completionTokens: z.number()
})

// Type exports
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type TestCase = z.infer<typeof TestCaseSchema>
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>

// --- Jira related schemas and types ---
export const JiraConfigSchema = z.object({
  baseUrl: z.string().url('Invalid Jira base URL'),
  email: z.string().email('Invalid email'),
  token: z.string().min(1, 'API token is required')
})

export const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    description: z.string().or(z.record(z.any())).optional(),
    acceptanceCriteria: z.string().or(z.record(z.any())).optional()
  })
})

export const JiraSearchResponseSchema = z.object({
  issues: z.array(JiraIssueSchema)
})

export type JiraConfig = z.infer<typeof JiraConfigSchema>
export type JiraIssue = z.infer<typeof JiraIssueSchema>
export type JiraSearchResponse = z.infer<typeof JiraSearchResponseSchema>
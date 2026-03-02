import { GenerateRequest, GenerateResponse, JiraSearchResponse } from "./types"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8081/api"

export async function generateTests(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-tests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error" }))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const data: GenerateResponse = await response.json()
    return data
  } catch (error) {
    console.error("Error generating tests:", error)
    throw error instanceof Error ? error : new Error("Unknown error occurred")
  }
}

export async function fetchJiraStories(config: { baseUrl: string; email: string; token: string }): Promise<JiraSearchResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/jira/stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      throw new Error(errorText || `HTTP error! status: ${response.status}`)
    }

    const data: JiraSearchResponse = await response.json()
    return data
  } catch (error) {
    console.error("Error fetching Jira stories:", error)
    throw error instanceof Error ? error : new Error("Unknown error occurred")
  }
}

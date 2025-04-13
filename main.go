package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

const (
	apiURL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-exp-03-25:generateContent"
	apiKey = "AIzaSyDv01tITVIGPswCN4e9Vb8c5Q2ulcb-_qI" // Replace with your actual API key
)

type Content struct {
	Parts []Part `json:"parts"`
	Role  string `json:"role,omitempty"`
}

type Part struct {
	Text string `json:"text"`
}

type RequestBody struct {
	Contents []Content `json:"contents"`
}

type ResponseBody struct {
	Candidates []struct {
		Content Content `json:"content"`
	} `json:"candidates"`
}

func main() {
	// Get API key from environment variable if available
	key := os.Getenv("GEMINI_API_KEY")
	if key == "" {
		key = apiKey
	}

	// Create the request payload
	requestBody := RequestBody{
		Contents: []Content{
			{
				Parts: []Part{
					{
						Text: "give me one example of german sentense in json format and nothing else. json should have german,",
					},
				},
			},
		},
	}

	// Marshal the request body to JSON
	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		fmt.Printf("Error marshaling JSON: %v\n", err)
		return
	}

	// Create the HTTP request
	req, err := http.NewRequest("POST", fmt.Sprintf("%s?key=%s", apiURL, key), bytes.NewBuffer(jsonData))
	if err != nil {
		fmt.Printf("Error creating request: %v\n", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	fmt.Print("hello")
	// Send the request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("Error sending request: %v\n", err)
		return
	}
	defer resp.Body.Close()

	// Read the response
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		fmt.Printf("Error reading response: %v\n", err)
		return
	}

	// Check for non-200 status
	if resp.StatusCode != http.StatusOK {
		fmt.Printf("API request failed with status %d: %s\n", resp.StatusCode, string(body))
		return
	}

	// Parse the response
	var response ResponseBody
	err = json.Unmarshal(body, &response)
	if err != nil {
		fmt.Printf("Error parsing response: %v\n", err)
		return
	}

	// Print the response
	if len(response.Candidates) > 0 {
		fmt.Println("Gemini Response:")
		for _, part := range response.Candidates[0].Content.Parts {
			fmt.Println(part.Text)
		}
	} else {
		fmt.Println("No response candidates found")
	}
}

package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

func LibreTranslateText(text, sourceLang, targetLang string) (string, error) {
	apiURL := "http://deadhorse.net:5000/translate"
	payload := map[string]any{
		"q":      text,
		"source": sourceLang,
		"target": targetLang,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("JSON marshal error: %w", err)
	}

	resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("HTTP request error: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response error: %w", err)
	}

	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("JSON unmarshal error: %w", err)
	}

	translated, ok := result["translatedText"].(string)
	if !ok {
		return "", fmt.Errorf("invalid response format")
	}

	return translated, nil
}

func GoogleTranslateText(text, sourceLanguage, targetLanguage string) (string, error) {
	baseURL := "https://translate.google.com/translate_a/single"
	params := url.Values{
		"client": {"gtx"},
		"sl":     {sourceLanguage},
		"tl":     {targetLanguage},
		"dt":     {"t"},
		"ie":     {"UTF-8"},
		"oe":     {"UTF-8"},
		"q":      {text},
	}

	fullURL := fmt.Sprintf("%s?%s", baseURL, params.Encode())

	// Create a request with appropriate headers to look like a browser
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return "", fmt.Errorf("create request error: %w", err)
	}

	// Set user agent to mimic a browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8")

	// Create HTTP client with a timeout
	client := &http.Client{Timeout: 30 * time.Second}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("translation request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("translation website returned status: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response error: %w", err)
	}

	// Parse JSON response
	var result []interface{}
	err = json.Unmarshal(body, &result)
	if err != nil {
		return "", fmt.Errorf("JSON parse error: %w", err)
	}

	// Extract translated text from nested JSON structure
	translatedText := ""
	if len(result) > 0 {
		if translations, ok := result[0].([]interface{}); ok {
			for _, translation := range translations {
				if pair, ok := translation.([]interface{}); ok && len(pair) > 0 {
					if str, ok := pair[0].(string); ok {
						translatedText += str
					}
				}
			}
		}
	}

	if translatedText == "" {
		return "", errors.New("could not extract translation from response")
	}

	return translatedText, nil
}

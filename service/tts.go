package service

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

func GenerateGoogleTTS(text, languageCode string) ([]byte, error) {
	baseURL := "http://translate.google.com/translate_tts"
	params := url.Values{
		"ie":      {"UTF-8"},
		"tl":      {languageCode},
		"q":       {text},
		"client":  {"tw-ob"},
		"total":   {"1"},
		"idx":     {"0"},
		"textlen": {fmt.Sprintf("%d", len(text))},
	}
	fullURL := fmt.Sprintf("%s?%s", baseURL, params.Encode())

	// Create request with browser-like headers
	req, err := http.NewRequest("GET", fullURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create request error: %w", err)
	}

	// Set headers to mimic a browser
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Accept", "*/*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Referer", "https://translate.google.com/")
	req.Header.Set("DNT", "1")
	req.Header.Set("Connection", "keep-alive")

	// Create HTTP client with a timeout
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("TTS request error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TTS API returned status: %s", resp.Status)
	}

	audioData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read audio error: %w", err)
	}
	return audioData, nil
}

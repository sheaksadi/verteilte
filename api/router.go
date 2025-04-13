package api

import "net/http"

func Setup(handler *http.ServeMux) {
	handler.HandleFunc("GET /api/test", TestHandler)
}

func TestHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status": "success", "message": "API test endpoint working"}`))
}

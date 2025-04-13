.PHONY: migrate-up migrate-down migrate-create migrate-reset

migrate-up:
	goose up

migrate-down:
	goose down

migrate-create:
	@read -p "Enter migration name: " name; \
	goose -s create $$name sql

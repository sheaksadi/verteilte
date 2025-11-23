#!/bin/bash

mkdir -p ../dictionaries

# Function to create a dictionary
create_dict() {
    LANG=$1
    DB_FILE="../dictionaries/${LANG}.db"
    
    rm -f "$DB_FILE" "$DB_FILE.gz"
    
    sqlite3 "$DB_FILE" <<EOF
CREATE TABLE dictionary (
    word TEXT PRIMARY KEY,
    pronunciation TEXT,
    gender TEXT,
    meanings TEXT,
    notes TEXT,
    synonyms TEXT,
    seeAlso TEXT
);

CREATE INDEX idx_dictionary_word ON dictionary(word);
EOF
}

# Function to add word
add_word() {
    LANG=$1
    WORD=$2
    MEANINGS=$3
    GENDER=$4
    
    DB_FILE="../dictionaries/${LANG}.db"
    
    sqlite3 "$DB_FILE" "INSERT INTO dictionary (word, meanings, gender, notes, synonyms, seeAlso) VALUES ('$WORD', '$MEANINGS', '$GENDER', '[]', '[]', '[]');"
}

# Spanish
create_dict "es"
add_word "es" "hola" '["hello", "hi"]' ""
add_word "es" "gato" '["cat"]' "masc"
add_word "es" "perro" '["dog"]' "masc"
add_word "es" "casa" '["house", "home"]' "fem"
add_word "es" "agua" '["water"]' "fem"
gzip -k "../dictionaries/es.db"

# French
create_dict "fr"
add_word "fr" "bonjour" '["hello", "good morning"]' ""
add_word "fr" "chat" '["cat"]' "masc"
add_word "fr" "chien" '["dog"]' "masc"
add_word "fr" "maison" '["house", "home"]' "fem"
add_word "fr" "eau" '["water"]' "fem"
gzip -k "../dictionaries/fr.db"

# Italian
create_dict "it"
add_word "it" "ciao" '["hello", "goodbye"]' ""
add_word "it" "gatto" '["cat"]' "masc"
add_word "it" "cane" '["dog"]' "masc"
add_word "it" "casa" '["house", "home"]' "fem"
add_word "it" "acqua" '["water"]' "fem"
gzip -k "../dictionaries/it.db"

# German (Mock)
# Backup existing if it's not a mock (check size maybe? or just backup always)
if [ -f "../dictionaries/de.db.gz" ]; then
    mv "../dictionaries/de.db.gz" "../dictionaries/de.db.gz.bak"
fi

create_dict "de"
add_word "de" "hallo" '["hello"]' ""
add_word "de" "katze" '["cat"]' "fem"
add_word "de" "hund" '["dog"]' "masc"
add_word "de" "haus" '["house"]' "neut"
add_word "de" "wasser" '["water"]' "neut"
gzip -k "../dictionaries/de.db"

echo "Mock dictionaries created in ../dictionaries/"

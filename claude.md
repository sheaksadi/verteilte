# Verteilte - Spaced Repetition Flashcard App

## Recent Changes (2025-11-15)

### Bug Fixes & Improvements

1. **Added Enter Key for Next Button**
   - Press **Enter** to move to next card when you got the answer wrong
   - Works the same as clicking the "Next" button
   - Makes reviewing faster and more convenient

2. **Fixed Flip Interruption Issue**
   - Keyboard input is now blocked while card is checking/flipping
   - Prevents accidental typing from canceling the flip animation
   - Ensures you can't interfere with the review process

2. **Smart Auto-Rating System**
   - ✅ **Correct spelling** → Auto-rated as "Great" (+2 score), moves to next card automatically
   - ❌ **Incorrect spelling** → Shows answer, Bad/Good/Great buttons disabled
   - **"Next" button appears** when incorrect - click to continue (auto-rated as "Bad")
   - This ensures you review the correct answer before moving on
   - Maximizes learning efficiency

2. **Improved English Dictionary Search - Phrase Matching**
   - Queries **200 results** from database (balanced performance)
   - Splits meanings by comma into separate phrases
   - Matches **each phrase** individually against your search
   - Example: "house, home, building" → matches each phrase separately
   - Fuzzy matching with Levenshtein distance for typo tolerance
   - Earlier phrases score better
   - Returns top 10 best matches

2. **More Suggestions**
   - German autocomplete: 10 suggestions (was 5)
   - English autocomplete: 10 suggestions (was 5)
   - Better chance of finding what you need!

3. **Fixed Auto-Advance Not Working**
   - Added extensive logging to track which buttons are being called
   - Console now shows: rating, card, score, score change
   - Check console to see what's happening

2. **Improved Score Changes**
   - **Bad**: -2 score (more penalty, pushes card back more)
   - **Good**: +1 score (steady progress)
   - **Great**: +2 score (fast progress for well-known cards)
   - Bad no longer has fixed 10min, it's based on resulting score

3. **Score Progression Examples**
   - Score 0 → Always 10 minutes (new/failed cards)
   - Score 1 → 1 hour
   - Score 2 → 2.5 hours  
   - Score 3 → 6.25 hours
   - Score 4 → 15.6 hours
   - Score 5 → 1.6 days
   - Score 6 → 4 days
   - Etc.

### Bug Fixes

1. **Fixed Spelling Check Flickering - v4 (FINAL FIX)**
   - **Problem**: `isCorrect` computed was re-running after `nextCard()` started
   - **Why**: `getAllWords()` re-sorts array, changing `currentCard`, triggering reactivity
   - **Solution**: Store the boolean result immediately when typing finishes
   - Use the stored boolean for auto-advance decision (not the reactive computed)
   - The computed is only for display purposes now

### Improved Spaced Repetition Algorithm

Based on research from Anki and SuperMemo, implemented scientifically-backed intervals:

**Bad (Again)**: Always 10 minutes
- Resets poorly-known cards to review soon

**Good**: 2.5x multiplier, starting at 1 hour
- Progression: 1h → 2.5h → 6.25h → 15.6h (~16h) → 1.6d → 4d → 10d → 25d → 62d...
- Steady growth for cards you know adequately

**Great**: 3x multiplier, starting at 1 hour  
- Progression: 1h → 3h → 9h → 27h (~1.1d) → 3.4d → 10d → 30d → 90d → 270d...
- Faster growth for cards you know very well

### UI Enhancements

1. **Score and Review on Card**
   - Score shown in top-left corner of flashcard
   - Last reviewed time in top-right corner
   - Visible on both front and back of card

2. **Button Time Indicators**
   - Each rating button now shows when the card will come back
   - **Bad**: Shows shorter interval (score -1)
   - **Good**: Shows current interval (score stays same)
   - **Great**: Shows longer interval (score +1)
   - Time format: seconds (s), minutes (m), hours (h), days (d)

### Latest Fixes

1. **Database Migration**
   - Added migration v2 to add spaced repetition fields to existing databases
   - Fixes "table words has no column named score" error
   - Existing users will now be migrated automatically

2. **Fixed Suggestion Selection**
   - Changed from `@click` to `@mousedown.prevent` to prevent blur event interference
   - Suggestions now properly fill in all fields when selected
   - No more focus/blur conflicts

3. **Improved English Search with Relevance Scoring**
   - Exact word match (e.g., "cat" matches "cat" in meanings): Score 1000
   - Word starts with search (e.g., "cat" matches "cats"): Score 500
   - Contains search term: Score 100
   - Results sorted by relevance, then by word length
   - Much better matches when typing English words

### Bug Fixes & Enhancements

1. **Fixed Word Addition**
   - Removed default word seeding that was preventing new words from being added
   - App now starts completely empty

2. **Bidirectional Dictionary Suggestions**
   - **German → English**: Type German word to get autocomplete (original behavior)
   - **English → German**: NEW! Type English word in translation field to find German equivalents
   - Both fields now have dropdown suggestions with article hints

## Recent Changes (2025-11-15)

### Implemented Spaced Repetition System

1. **Database Schema Updates**
   - Added `score` (INTEGER) - tracks how well the user knows the word
   - Added `createdAt` (INTEGER) - timestamp when word was created
   - Added `lastReviewedAt` (INTEGER) - timestamp of last review
   - Added `nextReviewAt` (INTEGER) - timestamp when card should be reviewed next

2. **Scoring System**
   - **Bad**: -1 to score (decreases interval)
   - **Good**: 0 to score (maintains current interval)
   - **Great**: +1 to score (increases interval)
   - Auto-scores as "Good" when user spells word correctly

3. **Review Interval Calculation**
   - Base interval: 1 minute
   - Formula: `baseInterval * Math.pow(2.5, score)`
   - Exponential backoff based on score
   - Cards sorted by `nextReviewAt` (earliest first)

4. **Responsive Input Boxes**
   - Input boxes now scale down for longer words:
     - ≤8 letters: `w-10 h-12 text-xl`
     - ≤12 letters: `w-8 h-10 text-lg`
     - ≤16 letters: `w-7 h-9 text-base`
     - >16 letters: `w-6 h-8 text-sm`

5. **Other Changes**
   - Removed default words (app starts empty)
   - Auto-rating on correct spelling: "Good" instead of "Great"

## Files Modified

- `src/lib/database.ts` - Added new fields, scoring logic, and review calculation
- `src-tauri/src/lib.rs` - Updated migration schema
- `src/App.vue` - Added responsive input sizing and button click handlers

## How It Works

1. User types the German word
2. On completion, system checks spelling
3. If correct: automatically advances with "Good" rating
4. If incorrect: user can manually choose Bad/Good/Great
5. Score updates and next review time is calculated
6. Cards re-sort to show due cards first

## To Run

```bash
# Development
npm run dev

# Build
npm run build

# Tauri dev
npm run tauri dev
```

## Database Migration Note

If you have existing data, you may need to reset the database or manually migrate:
- Delete `AppData/com.sheaksadi.verteilte/words.db` to start fresh
- Or manually add columns to existing database

-- Optional thumbnail/preview image for a news item.
-- Stores the image URL (hotlinked from the official source's CDN), not the bytes.
-- Populated from RSS media tags / listing <img> when available; null otherwise
-- (e.g. GitHub releases have no featured image).

ALTER TABLE news_items ADD COLUMN IF NOT EXISTS image_url TEXT;

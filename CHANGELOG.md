# Changelog

## Unreleased

- Actions added through the `command_deck_actions` filter are now validated: entries without a title or URL are skipped, and URLs are run through `esc_url_raw()` so a `javascript:` link can't be opened from the palette.
- The "(no title)" label for untitled search results is now translatable.

# Changelog

## Unreleased

- Actions added through the `command_deck_actions` filter are now validated: entries without a title or URL are skipped, and URLs are run through `esc_url_raw()` so a `javascript:` link can't be opened from the palette.
- The "(no title)" label for untitled search results is now translatable.
- Translations are now loaded from the plugin's `languages` folder (`load_plugin_textdomain()` plus a `Domain Path` header), so the palette can be translated without relying on WordPress.org language packs.

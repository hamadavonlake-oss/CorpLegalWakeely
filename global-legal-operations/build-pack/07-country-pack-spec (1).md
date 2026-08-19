# Country Pack Specification

A Country Pack is versioned content/configuration, never hard-coded legal logic.

## Package
country-pack/
- manifest.json
- locales/
- terminology.json
- currencies.json
- date-rules.json
- entity-types.json
- contract-types.json
- templates/
- validation-rules/
- tests/

## Manifest fields
pack_id, country_code, version, compatibility, changelog, legal_disclaimer, content_hash, signature, publisher.

## MVP supported settings
language, locale, RTL/LTR, currency, timezone, date/number formats, entity types, contract types, terminology, basic templates.

Advanced statutory rules, government integrations, court deadlines and official-form claims are deferred and require local legal review.

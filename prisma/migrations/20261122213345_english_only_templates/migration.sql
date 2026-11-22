-- Built-in templates are English only: remove the Urdu and Arabic versions
-- of the starter templates. Only rows the app added itself (createdById
-- 'system', ids tpl_starter_<key>_ur / _ar); templates made by people, and
-- workflows already created from a template (copies, no link), are kept.
-- Safe to run twice: a second run finds nothing to delete.
DELETE FROM "workflow_template"
WHERE "createdById" = 'system'
  AND "language" IN ('ur', 'ar')
  AND ("id" LIKE 'tpl\_starter\_%\_ur' OR "id" LIKE 'tpl\_starter\_%\_ar');

-- The "Product descriptions" starter wrote English, Urdu and Arabic: it now
-- writes English only (new name, description and Gemini prompt; the same
-- nodes otherwise). Only the app's own row; safe to run twice.
UPDATE "workflow_template"
SET "name" = 'Product descriptions written by AI',
    "description" = 'When you add a product to Shopify, Gemini writes a short English description from its title, type and tags and saves it on the product. Read it once before you sell. Set up: put your signing secret on the Shopify Trigger and create the Product creation webhook in Shopify; pick a credential on Gemini; pick your Shopify credential and type your Shop Domain on the Shopify node.',
    "nodes" = '[{"id":"tpl_starter_product_descriptions_three_languages_en_created","type":"SHOPIFY_TRIGGER","position":{"x":0,"y":0},"data":{"event":"products/create"}},{"id":"tpl_starter_product_descriptions_three_languages_en_write","type":"GEMINI","position":{"x":320,"y":0},"data":{"variableName":"description","systemPrompt":"You write product descriptions for an online shop. Write a short description in English, 2 or 3 sentences, as simple HTML in one or two <p> tags. Use only the facts given; do not invent sizes, materials or claims.","userPrompt":"Product: {{shopify.product.title}}\nType: {{shopify.product.product_type}}\nVendor: {{shopify.product.vendor}}\nTags: {{shopify.product.tags}}\nCurrent description: {{shopify.product.body_html}}"}},{"id":"tpl_starter_product_descriptions_three_languages_en_update","type":"SHOPIFY","position":{"x":640,"y":0},"data":{"variableName":"updatedProduct","operation":"update_product","shopDomain":"","productId":"{{shopify.product.id}}","description":"{{description.text}}"}}]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'tpl_starter_product_descriptions_three_languages_en'
  AND "createdById" = 'system';

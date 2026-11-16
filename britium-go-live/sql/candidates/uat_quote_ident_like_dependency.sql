-- UAT schema rehearsal candidate only; do not run on Production.
-- Source: read-only pg_get_functiondef from Production, 2026-11-16.
-- Addresses the first failure seen in a fresh Supabase branch:
-- function public._quote_ident_like(text,text) does not exist.
-- This is not sufficient to repair the full branch schema or 20260721093501 snapshot collision.
-- Must be incorporated at the correct point in a reviewed, full migration replay.
CREATE OR REPLACE FUNCTION public._quote_ident_like(text, text)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
    have    TEXT;
    pcision TEXT;
BEGIN
    -- Just return it if rhs isn't quoted.
    IF $2 !~ '"' THEN RETURN $1; END IF;

    -- If it's quoted ident without precision, return it quoted.
    IF $2 ~ '"$' THEN RETURN quote_ident($1); END IF;

    pcision := substring($1 FROM '[(][^")]+[)]$');

    -- Just quote it if thre is no precision.
    if pcision IS NULL THEN RETURN quote_ident($1); END IF;

    -- Quote the non-precision part and concatenate with precision.
    RETURN quote_ident(substring($1 FOR char_length($1) - char_length(pcision)))
        || pcision;
END;
$function$
;

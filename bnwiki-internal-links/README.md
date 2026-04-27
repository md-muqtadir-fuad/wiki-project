Run normally:

python clean_bnwiki_titles.py

Run with rejected-title debug log:

python clean_bnwiki_titles.py \
  --write-rejected ./new-project/title-files/bnwiki-rejected-titles.tsv

Allow mixed Bengali-English titles:

python clean_bnwiki_titles.py --allow-english

Important note: your old script removes bracketed disambiguation, for example ঢাকা (শহর) becomes ঢাকা. This version keeps the same default behavior, but you can preserve the full title using:

python clean_bnwiki_titles.py --keep-disambiguation
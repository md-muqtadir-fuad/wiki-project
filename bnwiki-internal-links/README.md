Run normally:

python bnwiki-internal-links\title-cleaner.py

Run with rejected-title debug log:

python bnwiki-internal-links\title-cleaner.py \
  --write-rejected ./new-project/title-files/bnwiki-rejected-titles.tsv

Allow mixed Bengali-English titles:

python bnwiki-internal-links\title-cleaner.py --allow-english

python bnwiki-internal-links\title-cleaner.py --keep-disambiguation


Bengali StopWords. (n.d.). https://www.ranks.nl/stopwords/bengali
https://github.com/qwertyz15/Data-Set/blob/master/bengali%20stop%20words.txt
Bangla StopWords (700+). (2022, May 2). https://www.kaggle.com/datasets/shohanursobuj/bangla-stopwords
https://github.com/stopwords-iso/stopwords-bn
https://github.com/Xangis/extra-stopwords
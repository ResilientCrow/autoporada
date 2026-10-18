# Gotenberg with the fonts the porada needs. The DOCX is the canonical file;
# this image only decides how faithful the PDF is.
#
# - Times New Roman, Courier New: metric-compatible Liberation fonts (in the base image)
# - Symbol / Wingdings bullets: LibreOffice maps them to OpenSymbol (in the base image)
# - Aptos Narrow (Příloha 1 table): PT Sans Narrow (free, full Czech coverage), via fonts.conf
# - Licensed originals: put .ttf/.otf files into docker/gotenberg/fonts/ and rebuild
FROM gotenberg/gotenberg:8.38.1

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-paratype \
  && rm -rf /var/lib/apt/lists/*
COPY fonts.conf /etc/fonts/conf.d/60-autoporada.conf
COPY fonts/ /usr/local/share/fonts/school/
RUN fc-cache -f
USER gotenberg

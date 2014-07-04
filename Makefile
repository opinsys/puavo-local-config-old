prefix = /usr/local
exec_prefix = $(prefix)
bindir = $(exec_prefix)/bin
libdir = $(prefix)/lib
sbindir = $(exec_prefix)/sbin
datarootdir = $(prefix)/share
sysconfdir = $(prefix)/etc

INSTALL = install
INSTALL_PROGRAM = $(INSTALL)
INSTALL_DATA = $(INSTALL) -m 644

.PHONY : all
all :

.PHONY : installdirs
installdirs :
	mkdir -p $(DESTDIR)$(bindir)
	mkdir -p $(DESTDIR)$(libdir)/puavo-laptop-config

.PHONY : install
install : installdirs
	$(INSTALL_PROGRAM) -t $(DESTDIR)$(bindir) \
		puavo-laptop-config               \
		puavo-laptop-config-ui

	$(INSTALL_DATA) -t $(DESTDIR)$(libdir)/puavo-laptop-config-ui \
		app/index.html   \
		app/package.json \
		app/style.css

.PHONY : clean
clean :

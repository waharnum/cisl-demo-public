/* global fluid, cisl, r2NavWeb */

(function (fluid) {
    "use strict";

    fluid.defaults("cisl.readium.webViewer", {
        gradeNames: ["fluid.viewComponent"],
        readiumOptions: {
            webpubUrl: {
                expander: {
                    funcName: "cisl.readium.webViewer.determineManifestUrl",
                    args: ["{that}.options.readiumOptions.manifestUrlConfig.parameterId", "{that}.options.readiumOptions.manifestUrlConfig.urlTemplate"]
                }
            },
            manifestUrlConfig: {
                parameterId: "pub",
                urlTemplate: "pubs/%pubId/manifest.json"
            },
            viewport: {
                width: {
                    expander: {
                        funcName: "cisl.readium.webViewer.getViewportWidth",
                        args: ["{that}.container"]
                    }
                },
                height: {
                    expander: {
                        funcName: "cisl.readium.webViewer.getViewportHeight",
                        args: ["{that}.container"]
                    }
                },
                vertical: true
            },
            pageLayout: {
                width: {
                    expander: {
                        funcName: "cisl.readium.webViewer.getPageLayoutWidth",
                        args: ["{that}.container"]
                    }
                },
                height: {
                    expander: {
                        funcName: "cisl.readium.webViewer.getPageLayoutHeight",
                        args: ["{that}.container"]
                    }
                },
                // Valid options for spreadMode:
                // - Freeform,
                // - FitViewportAuto,
                // - FitViewportSingleSpread,
                // - FitViewportDoubleSpread,
                spreadMode: "Freeform"
            }
        },
        selectors: {
            prev: ".cislc-readium-control-prev",
            next: ".cislc-readium-control-next",
            iframeContainer: ".cislc-readium-iframe-container"
        },
        invokers: {
            nextScreen: {
                "this": "{that}.nav",
                "method": "nextScreen"
            },
            previousScreen: {
                "this": "{that}.nav",
                "method": "previousScreen"
            }
        },
        events: {
            onPublicationLoaded: null,
            onPublicationLoadError: null,
            onIFrameLoaderReady: null,
            onIFrameLoaded: null,
            onRenditionReady: null,
            onRenditionRenderError: null,
            onNavigatorReady: null
        },
        listeners: {
            "onCreate.loadPublication": {
                func: "cisl.readium.webViewer.loadPublication",
                args: ["{that}.options.readiumOptions",
                        "{that}.events.onPublicationLoaded",
                        "{that}.events.onPublicationLoadError",
                        "{that}"]
            },
            "onPublicationLoaded.handle": {
                func: "cisl.readium.webViewer.handlePublicationLoaded",
                args: ["{arguments}.0",
                        "{that}.events.onIFrameLoaderReady",
                        "{that}.events.onIFrameLoaded",
                        "{that}.events.onRenditionReady",
                        "{that}.events.onRenditionRenderError",
                        "{that}"]
            },
            "onRenditionReady.handle": {
                func: "cisl.readium.webViewer.handleRenditionReady",
                args: ["{that}.events.onNavigatorReady", "{that}"]
            },
            "onIFrameLoaded.handle": {
                func: "cisl.readium.webViewer.handleIFrameLoaded",
                args: ["{arguments}.0", "{that}"]
            },
            "onCreate.bindPrev": {
                "this": "{that}.dom.prev",
                "method": "click",
                "args": ["{that}.previousScreen"]
            },
            "onCreate.bindNext": {
                "this": "{that}.dom.next",
                "method": "click",
                "args": ["{that}.nextScreen"]
            }
        },
        members: {
            publication: null,
            rendition: null,
            nav: null,
            iFrameLoader: null,
        }
    });

    cisl.readium.webViewer.getViewportWidth = function (container) {
        return Math.min(window.innerWidth-50, 800);
    };

    cisl.readium.webViewer.getViewportHeight = function (container) {
        return window.innerHeight-50;
    };

    cisl.readium.webViewer.getPageLayoutWidth = function (container) {
        return 800;
    };

    cisl.readium.webViewer.getPageLayoutHeight = function (container) {
        return 800;
    };

    cisl.readium.webViewer.determineManifestUrl = function (parameterId, urlTemplate) {
        var pubId = new URLSearchParams(window.location.search).get(parameterId);
        return fluid.stringTemplate(urlTemplate, {pubId: pubId});
    };

    cisl.readium.webViewer.handleIFrameLoaded = function (loadedIFrame, readiumComponent) {
        var readiumIframeBody = $(loadedIFrame).contents().find("body");
        var injector = fluid.uiEnhancerInjector({
            components: {
                iFrameUIEnhancer: {
                    container: readiumIframeBody
                }
            }
        });
    };

    cisl.readium.webViewer.loadPublication = function (readiumOptions, loadEvent, loadErrorEvent, readiumComponent) {
        console.log("loadPublication", readiumOptions);

        var fullURL = new URL(readiumOptions.webpubUrl, window.location.href).toString();

        r2NavWeb.Publication.fromURL(fullURL).then(
            function (publication) {
            readiumComponent.publication = publication;
            loadEvent.fire(publication);
        }, function (error) {
            console.log(error);
            loadErrorEvent.fire(error);
        });
    };

    cisl.readium.webViewer.handlePublicationLoaded = function (publication, iFrameLoaderReadyEvent, iFrameLoadedEvent, renditionReadyEvent, renditionRenderErrorEvent, readiumComponent) {

        var readiumOptions = readiumComponent.options.readiumOptions;

        console.log(publication, readiumComponent);

        // FIXME, this is a hack
        var glossaryURI = publication.sourceURI.replace("manifest.json", "glossary.json");
        jQuery.get(glossaryURI)
            .done(function(res) {
                addToUserGlossary(res, glossaryURI);
            })
            .fail(function(err) {
                console.log("Failure getting glossary", err);
            });

        var loader = new r2NavWeb.IFrameLoader(publication.getBaseURI());

        loader.setReadiumCssBasePath("../../readium-css");

        readiumComponent.iFrameLoader = loader;

        iFrameLoaderReadyEvent.fire(loader);

        loader.addIFrameLoadedListener(function (loadedIframe) {
            iFrameLoadedEvent.fire(loadedIframe);
        });

        var cvf = new r2NavWeb.R2ContentViewFactory(loader);

        var rendition = new r2NavWeb.Rendition(publication, readiumComponent.locate("iframeContainer")[0], cvf);

        rendition.setViewAsVertical(readiumOptions.viewport.vertical);

        // W, H
        rendition.viewport.setViewportSize(readiumOptions.viewport.width, readiumOptions.viewport.height);

        rendition.viewport.setPrefetchSize(Math.ceil(readiumOptions.viewport.width * 0.1));

        var p = rendition.setPageLayout({
            spreadMode: r2NavWeb.SpreadMode[readiumOptions.pageLayout.spreadMode],
            pageWidth: readiumOptions.pageLayout.width,
            pageHeight: readiumOptions.pageLayout.height,
        });

        rendition.render().then(
            function () {
                rendition.viewport.enableScroll(false);
                rendition.viewport.renderAtOffset(0);
                readiumComponent.rendition = rendition;
                renditionReadyEvent.fire();
            },
            function (error) {
                console.log(error);
                renditionRenderErrorEvent.fire();
            }
        );
    };

    cisl.readium.webViewer.handleRenditionReady = function (navigatorReadyEvent, readiumComponent) {
        console.log("handleRenditionReady", readiumComponent);
        var nav = new r2NavWeb.Navigator(readiumComponent.rendition);
        readiumComponent.nav = nav;
        navigatorReadyEvent.fire();
    };

    fluid.defaults("fluid.uiEnhancerInjector", {
                gradeNames: ["fluid.component"],
                components: {
                    iFrameUIEnhancer: {
                        type: "fluid.uiEnhancer",
                        // container: "body",
                        options: {
                            model: "{fluid.pageEnhancer}.uiEnhancer.model",
                            gradeNames: ["fluid.uiEnhancer.starterEnactors"],
                            components: {
                                glossary: {
                                    type: "cisl.prefs.enactor.glossary.demo",
                                    options: {
                                        model: {
                                            glossary: "{uiEnhancer}.model.cisl_prefs_glossary"
                                        },
                                        glossaryOptions: {
                                            // Selector to use for glossary
                                            scopeSelector: "{uiEnhancer}.container",
                                            iFrameContainerSelector: ".cislc-readium-iframe-container"
                                        }
                                    }
                                },
                                textSize: {
                                    type: "cisl.prefs.enactor.textSize",
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_textSize"
                                        }
                                    }
                                },
                                textFont: {
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_textFont"
                                        },
                                        classes: {
                                            arial: "fl-font-arial",
                                            comic: "fl-font-comic-sans",
                                            default: "",
                                            times: "fl-font-times",
                                            verdana: "fl-font-verdana",
                                            "open-dyslexic": "cisl-font-open-dyslexic"
                                        }
                                    }
                                },
                                contrast: {
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_contrast"
                                        }
                                    }
                                },
                                lineSpace: {
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_lineSpace"
                                        }
                                    }
                                },
                                letterSpace: {
                                    type: "fluid.prefs.enactor.letterSpace",
                                    container: "{uiEnhancer}.container",
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_letterSpace"
                                        }
                                    }
                                },
                                enhanceInputs: {
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_enhanceInputs"
                                        }
                                    }
                                },
                                tableOfContents: {
                                    options: {
                                        model: {
                                            value: "{uiEnhancer}.model.fluid_prefs_layoutControls"
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

})(fluid_3_0_0);

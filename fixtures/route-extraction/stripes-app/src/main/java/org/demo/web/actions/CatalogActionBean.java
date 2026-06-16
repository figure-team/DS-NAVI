package org.demo.web.actions;

import net.sourceforge.stripes.action.DefaultHandler;
import net.sourceforge.stripes.action.ForwardResolution;
import net.sourceforge.stripes.action.Resolution;

public class CatalogActionBean extends AbstractActionBean {

    @DefaultHandler
    public Resolution list() {
        return new ForwardResolution("/catalog.jsp");
    }

    public Resolution viewCategory() {
        return new ForwardResolution("/category.jsp");
    }
}

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

    // 선언 반환타입이 서브타입(ForwardResolution) — 베이스 Resolution 만 매칭하면 누락된다.
    public ForwardResolution viewProduct() {
        return new ForwardResolution("/product.jsp");
    }
}

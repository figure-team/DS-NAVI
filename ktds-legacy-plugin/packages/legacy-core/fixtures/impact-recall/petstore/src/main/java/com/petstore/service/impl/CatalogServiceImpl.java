package com.petstore.service.impl;

import com.petstore.service.CatalogService;
import com.petstore.persistence.ProductMapper;
import com.petstore.domain.Product;
import com.petstore.common.StringUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CatalogServiceImpl implements CatalogService {

  @Autowired
  private ProductMapper productMapper;

  private StringUtils stringUtils;

  public Product find(int id) {
    Product p = productMapper.selectById(id);
    p.setName(stringUtils.normalize(p.getName()));
    return p;
  }
}

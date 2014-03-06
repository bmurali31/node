var _ = require('lodash');

var autoApi = module.exports = function (app, models, options) {
    this.models = models;
    this.app = app;
    this.options = _.extend({
        endpoint: '/api'
    }, options || {});
}

autoApi.prototype.isApiRequest = function (path) {
    return path.indexOf(this.options.endpoint) === 0;
}

autoApi.prototype.handleRequest = function (req, res, next) {
    var regex = new RegExp("^" + this.options.endpoint + "/?([^/]+)?/?([^/]+)?$")
        , match = req.path.match(regex);

    if (!!match) {
        var modelName = match[1]
          , identifier = match[2];

        if (req.method === 'GET' && req.path === this.options.endpoint) {
            // this is a GET call to the root path (/api)
        }
        else if (!!modelName) {
            var model = this.models[modelName];

            // model doesnt exist? move on...
            if (!model) {
                next();
                return;
            }

            if (!identifier) {
                // this is a call to the root of a model (/api/<model>)
                if (req.method === 'GET') {
                    this.handleModelIndex(model, req, res);
                }
                else if (req.method === 'POST') {
                    this.handleModelCreate(model, req, res);
                }
                else {
                    next();
                    return;
                }

                return;
            }
            else if (!!identifier) {
                // this is a call to an instance of a model (/api/<model>/<id>)
                if (req.method === 'POST' && identifier === 'search') {
                    this.handleModelSearch(this.models, model, req, res);
                }
                else if (req.method === 'GET') {
                    this.handleInstanceRetrieve(model, identifier, req, res);
                }
                else if (req.method === 'PUT') {
                    this.handleInstanceUpdate(model, identifier, req, res);
                }
                else if (req.method === 'DELETE') {
                    this.handleInstanceDelete(model, identifier, req, res);
                }

                return;
            }
        }
    }

    next();
}

autoApi.prototype.constructIncludes = function (req, res, model) {
    if (!!req.headers) {
        if (!!req.headers['x-include']) {
            var includeNames = req.headers['x-include'].split(',');
            var includes = [];

            for (var i = 0; i < includeNames.length; i++) {
                var includeName = includeNames[i].trim().toLowerCase();
                var targetModel = null;
                var targetAlias = null;
                for (var key in model.associations) {
                    var association = model.associations[key];
                    if (association.target.tableName.toLowerCase() == includeName) {
                        targetModel = this.models[association.target.tableName]
                        targetAlias = key;
                        break;
                    }
                }

                //var includedModel = this.models[includeName];

                if (!targetModel) {
                    return { missing: includeName };
                }

                includes.push({ model: targetModel, as: targetAlias });
            }

            if (includes.length > 0) {
                return includes;
            }
        }
    }

    return null;
}

autoApi.prototype.handleModelIndex = function (model, req, res) {
    var query = {
        include: null
    }

    var includes = this.constructIncludes(req, res, model);
    if (!!includes && !!includes.missing) {
        res.writeHead(400, 'Invalid include');
        res.end();
        return;
    }
    query.include = includes;

    model.findAll(query).complete(function (err, objs) {
        if (!!err) {
            res.statusCode = 500;
            res.json(err);
            res.end();
            return;
        }

        res.json(objs);
    })
}

autoApi.prototype.handleModelCreate = function (model, req, res) {
    if (req.body === null) {
        res.statusCode = 400;
        res.end()
        return;
    }

    var newObj = model.build(req.body);
    newObj.save().complete(function (err) {
        if (!!err) {
            res.statusCode = 500;
            res.json(err);
            res.end();
            return;
        }

        res.statusCode = 201;
        res.json(newObj);
    });
}

autoApi.prototype.handleModelSearch = function (models, model, req, res) {
    var query = {
        where: req.body,
        order: null,
        offset: null,
        limit: null,
        include: null
    };

    if (!!req.query) {
        if (!!req.query.order) {
            var order = req.query.order;

            if (!(order instanceof Array))
                order = [order]

            for (var i = 0; i < order.length; i++) {
                var orderParts = order[i].split(' ', 2)

                if (orderParts.length == 1) continue;

                switch (orderParts[1].toLowerCase()) {
                    case "asc":
                    case "desc":
                        order[i] = orderParts
                        break;
                    default:
                        order[i] = orderParts[0]
                }
            }

            query.order = order;
        }

        if (!!req.query.offset) {
            query.offset = parseInt(req.query.offset)
        }

        if (!!req.query.limit) {
            query.limit = parseInt(req.query.limit)
        }
    }

    var includes = this.constructIncludes(req, res, model);
    if (!!includes && !!includes.missing) {
        res.writeHead(400, 'Invalid include');
        res.end();
        return;
    }
    query.include = includes;

    if (!!query.offset || !!query.limit) {
        if (!!query.include) {
            res.statusCode = 400;
            res.end();
            return;
        }

        model.findAndCountAll(query).complete(function (err, objs) {
            if (!!err) {
                res.statusCode = 500;
                res.json(err);
                res.end();
                return;
            }

            res.setHeader("X-Count", objs.count)
            res.json(objs.rows);
        })
    }
    else {
        model.findAll(query).complete(function (err, objs) {
            if (!!err) {
                res.statusCode = 500;
                res.json(err);
                res.end();
                return;
            }

            res.json(objs);
        })
    }
}

autoApi.prototype.handleInstanceRetrieve = function (model, identifier, req, res) {
    var query = null;

    var includes = this.constructIncludes(req, res, model);
    if (!!includes && !!includes.missing) {
        res.writeHead(400, 'Invalid include');
        res.end();
        return;
    }
    else if (!!includes) {
        query = query || {};
        query.include = includes;
    }

    if (!!query) {
        query.where = {};

        if (model.hasPrimaryKeys) {
            query.where[model.primaryKeyAttributes[0]] = identifier;
        } else {
            query.where.id = identifier;
        }
    }

    query = query || identifier;

    model.find(query).complete(function (err, obj) {
        if (!!err) {
            res.statusCode = 500;
            res.json(err);
            res.end();
            return;
        }

        if (obj === null) {
            res.statusCode = 404;
            res.end()
            return;
        }
        res.json(obj);
    });
}

autoApi.prototype.handleInstanceUpdate = function (model, identifier, req, res) {
    if (req.body === null) {
        res.statusCode = 400;
        res.end()
        return;
    }

    model.find(identifier).complete(function (err, obj) {
        if (!!err) {
            res.statusCode = 500;
            res.json(err);
            res.end();
            return;
        }

        if (obj === null) {
            res.statusCode = 404;
            res.end()
            return;
        }

        obj.updateAttributes(req.body).complete(function (err, obj) {
            if (!!err) {
                res.statusCode = 500;
                res.json(err);
                res.end();
                return;
            }

            res.json(obj)
        })
    })
}

autoApi.prototype.handleInstanceDelete = function (model, identifier, req, res) {
    model.find(identifier).complete(function (err, obj) {
        if (!!err) {
            res.statusCode = 500;
            res.json(err);
            res.end();
            return;
        }

        if (obj === null) {
            res.statusCode = 404;
            res.end()
            return;
        }

        obj.destroy().complete(function (err) {
            if (!!err) {
                res.statusCode = 500;
                res.json(err);
                res.end();
                return;
            }

            res.end();
        })
    })
}

autoApi.prototype.createHandler = function () {
    var self = this;

    return function (req, res, next) {
        self.handleRequest(req, res, next);
    };
}


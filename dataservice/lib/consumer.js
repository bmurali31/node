var request = require('request'),
    q = require('q');


var consume = module.exports = function (uri, entityName) {
    this.uri = uri;
    this.entityName = entityName;
}

consume.prototype.execute = function (req) {
    var defered = q.defer();

    request(req, function (err, res, body) {
        if (err) {
            defered.reject(err);
            return;
        }

        if (res.statusCode >= 400) {
            defered.reject({ message: "Could not retrieve object" });
            return;
        }

        var obj = JSON.parse(body);
        defered.resolve(obj);
    });

    return defered.promise;
}

consume.prototype.get = function (id, options) {
    var req = {
        url: this.uri + '/' + this.entityName + '/' + id.toString(),
        headers: options.headers
    };

    return this.execute(req);
}

consume.prototype.getAll = function (options) {
    var req = {
        url: this.uri + '/' + this.entityName,
        headers: options ? options.headers : undefined
    };

    return this.execute(req);
}

consume.prototype.create = function (obj) {

    var req = {
        method: 'POST',
        url: this.uri + '/' + this.entityName,
        json: obj
    };

    return this.execute(req);

}

consume.prototype.update = function (id, obj, callback) {
    var req = {
        method: 'PUT',
        url: this.uri + '/' + this.entityName + '/' + id.toString(),
        json: obj
    };

    return this.execute(req);

}


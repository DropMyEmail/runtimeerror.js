var jasmine = require('jasmine-node');
var lodash = require('lodash');
var runtimeerror = require("../lib/runtimeerror");
var strftime = require('strftime');
var today = strftime.strftime('%b %d', new Date());
var noop = function() { };
var nothing = null;

describe("runtimeerror", function() {
  describe("make_generic_title", function() {
    it("should change digits to {N}", function() {
      expect(runtimeerror.make_generic_title("1,23-456abc7890.12 345")).toBe("{N},{N}-{N}abc{N} {N}");
    });
    it("should change hexadecimals to {HEX}", function() {
      expect(runtimeerror.make_generic_title("1,23-0x1234567.12 345")).toBe("{N},{N}-{HEX}.{N} {N}");
    });
    it("should remove email subject prefixes - fw:, fwd:, re:", function() {
      expect(runtimeerror.make_generic_title("fw: hello world there")).toBe("hello world there");
      expect(runtimeerror.make_generic_title("re: hello world there")).toBe("hello world there");
      expect(runtimeerror.make_generic_title("fwd: hello world there")).toBe("hello world there");
      expect(runtimeerror.make_generic_title("re: fwd: hello world there")).toBe("hello world there");
      expect(runtimeerror.make_generic_title("fwd: fw: hello world there")).toBe("hello world there");
    });
    it("should fail gracefully with undefined/null", function() {
      expect(runtimeerror.make_generic_title()).toBe("");
      expect(runtimeerror.make_generic_title(null)).toBe("");
      expect(runtimeerror.make_generic_title(false)).toBe("");
    })
  })
  describe("update_body_suffix", function() {
    var oneday = 3600000*24;
    it("should append suffix [today, 1]", function() {
      expect(runtimeerror.update_body_suffix('hello')).toBe('hello<br/>\n{"runtimeerror":["' + today + '",1]}');
    });
    it("should modify suffix if exist", function() {
      expect(runtimeerror.update_body_suffix('hello<br/>\n{"runtimeerror": ["' + today + '",99]}')).toBe('hello<br/>\n{"runtimeerror":["' + today + '",100]}');
    });
    it("should keep old date & counts if exist", function() {
      var yesterday = strftime.strftime('%b %d', new Date(new Date() - oneday));
      var ancient  = strftime.strftime('%b %d', new Date(new Date() - oneday*7));
      expect(runtimeerror.update_body_suffix('hello<br/>\n{"runtimeerror": ["' + ancient + '",88,"' + yesterday + '",99]}')).toBe('hello<br/>\n{"runtimeerror":["' + yesterday + '",99,"' + today + '",1]}');
    });
  });
  describe("extract_repo_secret_provider(email)", function() {
    it("should return object with attributes: repo, secret, provider", function() {
      var result = runtimeerror.extract_repo_secret_provider('"hello/world.js" <abc.def@smtp.random.com>');
      expect(JSON.stringify(result)).toBe(JSON.stringify({ repo: 'hello/world.js', secret: 'abc.def', provider: 'smtp.random' }));
    });
    it("should return blank object with invalid email", function() {
      expect(JSON.stringify(runtimeerror.extract_repo_secret_provider('hello'))).toBe(JSON.stringify({ }));
      expect(JSON.stringify(runtimeerror.extract_repo_secret_provider(null))).toBe(JSON.stringify({ }));
      expect(JSON.stringify(runtimeerror.extract_repo_secret_provider())).toBe(JSON.stringify({ }));
    });
  });
  describe("instance", function() {
    var account = runtimeerror.find_or_create_account({ repo: 'repoA', secret: 'secretB', provider: 'none' });
    describe("find_or_create_account(repo, secret, provider)", function() {
      it("should create new instance of provider.Provider", function() {
        expect(account.repo).toBe('repoA');
        expect(account.secret).toBe('secretB');
        expect(account.provider).toBe('none');
      });
      it("should reuse existing instance", function() {
        expect(runtimeerror.find_or_create_account({ repo: 'repoA', secret: 'secretB', provider: 'none' })).toBe(account);
      });
    });
    describe("handle(account, title, body)", function() {
      it("should call account.find_issue_by_title", function() {
        spyOn(account, 'find_issue_by_title').andCallFake(function(title, callback) { });
        runtimeerror.handle(account, "titleA", "bodyB", noop);
        expect(account.find_issue_by_title).toHaveBeenCalledWith("titleA", jasmine.any(Function));
      });
      it("should call account.make_generic_title", function() {
        spyOn(runtimeerror, 'make_generic_title').andCallFake(function(title) { });
        runtimeerror.handle(account, "titleA", "bodyB", noop);
        expect(runtimeerror.make_generic_title).toHaveBeenCalledWith("titleA");
      });
      it("should call account.update_body_suffix", function() {
        spyOn(runtimeerror, 'update_body_suffix').andCallFake(function(body) { });
        runtimeerror.handle(account, "titleA", "bodyB", noop);
        expect(runtimeerror.update_body_suffix).toHaveBeenCalledWith("bodyB");
      });
      describe("find_issue_by_title yield nothing", function() {
        beforeEach(function() {
          spyOn(account, 'find_issue_by_title').andCallFake(function(title, callback) { callback(); });
        });
        it("should call account.create_issue", function() {
          spyOn(account, 'create_issue').andCallFake(function(attrs, callback) { })
          runtimeerror.handle(account, "titleA", "bodyB", noop);
          expect(account.create_issue).toHaveBeenCalledWith({ title: "titleA", body: "bodyB<br/>\n{\"runtimeerror\":[\"" + today + "\",1]}" }, noop);
        });
        it("should create_issue with HTML wrapper removed from body", function() {
          spyOn(account, 'create_issue').andCallFake(function(attrs, callback) { })
          runtimeerror.handle(account, "titleA", "<HTML>\n<head>\n</head>\n<body>bodyB</body>\n</HTML>", noop);
          expect(account.create_issue).toHaveBeenCalledWith({ title: "titleA", body: "<body>bodyB</body><br/>\n{\"runtimeerror\":[\"" + today + "\",1]}" }, noop);
        })
      });

      var something = { number: "123", title: "hey", body: "you" };
      describe("find_issue_by_title yield {open}", function() {
        beforeEach(function() {
          spyOn(account, 'find_issue_by_title').andCallFake(function(title, callback) { callback(nothing, something); });
          spyOn(account, 'reopen_issue').andCallFake(function(uid, attrs, callback) { callback(nothing, something); });
          spyOn(account, 'update_issue').andCallFake(function(uid, attrs, callback) { callback(nothing, something); });
          spyOn(account.api, 'is_closed').andCallFake(function() { return false; });
        });
        it("should call account.update_issue ONLY", function() {
          runtimeerror.handle(account, "titleA", "bodyB", noop);
          expect(account.find_issue_by_title).toHaveBeenCalled();
          expect(account.update_issue)       .toHaveBeenCalledWith(account.uid_for(something), something, noop);
          expect(account.reopen_issue)       .not.toHaveBeenCalled();
        });
        it("should abort (when wontfix)", function() {
          spyOn(account.api, 'is_wontfix').andCallFake(function() { return true; });
          runtimeerror.handle(account, "titleA", "bodyB", noop);
          expect(account.find_issue_by_title).toHaveBeenCalled();
          expect(account.update_issue)       .not.toHaveBeenCalled();
          expect(account.reopen_issue)       .not.toHaveBeenCalled();
        })
      });

      describe("find_issue_by_title yield {closed}", function() {
        beforeEach(function() {
          spyOn(account, 'find_issue_by_title').andCallFake(function(title, callback) { callback(nothing, something); });
          spyOn(account, 'reopen_issue').andCallFake(function(uid, attrs, callback) { callback(nothing, something); });
          spyOn(account, 'update_issue').andCallFake(function(uid, attrs, callback) { callback(nothing, something); });
          spyOn(account.api, 'is_closed').andCallFake(function() { return true; });
        });
        it("should call account.reopen", function() {
          runtimeerror.handle(account, "titleA", "bodyB", noop);
          expect(account.find_issue_by_title).toHaveBeenCalled();
          expect(account.reopen_issue)       .toHaveBeenCalledWith(account.uid_for(something), { title: "titleA", body: "bodyB<br/>\n{\"runtimeerror\":[\"" + today + "\",1]}" }, jasmine.any(Function));
          expect(account.update_issue)       .not.toHaveBeenCalled();
        });
        it("should reopen_issue with HTML wrapper removed from body", function() {
          runtimeerror.handle(account, "titleA", "<HTML>\n<head>\n</head>\n<body>bodyB</body>\n</HTML>", noop);
          expect(account.reopen_issue)      .toHaveBeenCalledWith(account.uid_for(something), { title: "titleA", body: "<body>bodyB</body><br/>\n{\"runtimeerror\":[\"" + today + "\",1]}" }, noop);
        });
        it("should abort (when wontfix)", function() {
          spyOn(account.api, 'is_wontfix').andCallFake(function() { return true; });
          runtimeerror.handle(account, "titleA", "bodyB", noop);
          expect(account.find_issue_by_title).toHaveBeenCalled();
          expect(account.reopen_issue)       .not.toHaveBeenCalled();
          expect(account.update_issue)       .not.toHaveBeenCalled();
        });
      });
    });
  });
});

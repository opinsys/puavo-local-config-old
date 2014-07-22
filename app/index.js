var child_process = require('child_process');
var fs = require('fs');

var config_json_path = '/state/etc/puavo/local/config.json';

function add_download_button(license_key, errormsg_element, download_done) {
  var button = document.createElement('button');

  var styles = {
    error:      'background-color: red',
    ok:         'background-color: lightgreen',
    download_a: 'background-color: yellow',
    download_b: 'background-color: white',
  };

  if (download_done) {
    button.textContent = 'INSTALLED';
    button.setAttribute('style', styles.ok);
    return button;
  }

  button.textContent = 'DOWNLOAD';
  button.addEventListener('click',
                          function(e) {
                            e.preventDefault();
                            download_pkg(license_key,
                                         button,
                                         styles,
                                         errormsg_element); });

  return button;
}

function add_licenses(license_list) {
  var ll = document.querySelector('table[id=license_list]');

  check_download_packs(function (downloaded_packs) {
                         for (var i in license_list) {
                           var license = license_list[i];
                           add_one_license(ll,
                                           license,
                                           downloaded_packs[license.key]);
                         }
                       });
}

function add_one_license(parentNode, license_info, download_done) {
  var tr = document.createElement('tr');

  // create license name element
  var license_name_td = document.createElement('td');
  license_name_td.textContent = license_info.name;
  tr.appendChild(license_name_td);

  // create license url link
  var license_url_td = document.createElement('td');
  var a = document.createElement('a');
  a.setAttribute('href', license_info.url);
  a.addEventListener('click',
                     function(e) { e.preventDefault();
                                   open_external_link(a); });
  a.textContent = '(license terms)';
  tr.appendChild( license_url_td.appendChild(a) );

  var download_td = document.createElement('td');
  var download_errormsg_element = document.createElement('td');
  download_td.appendChild( add_download_button(license_info.key,
                                               download_errormsg_element,
                                               download_done) );
  tr.appendChild(download_td);

  var accept_td = document.createElement('td');
  var input = document.createElement('input');
  input.setAttribute('class', 'license_acceptance_checkbox');
  input.setAttribute('name', license_info.key);
  input.setAttribute('type', 'checkbox');
  tr.appendChild( accept_td.appendChild(input) );

  tr.appendChild(download_errormsg_element);

  parentNode.appendChild(tr);
}

function make_local_users_config(response,
                                 i,
                                 old_config,
                                 new_config,
                                 has_errors,
                                 cb) {
  var next_user_fn = function() {
                       make_local_users_config(response,
                                               i+1,
                                               old_config,
                                               new_config,
                                               has_errors,
                                               cb);
                     };

  if (!(('localuser_' + i + '_login') in response))
    return cb(has_errors);

  var login     = response['localuser_' + i + '_login'    ].value;
  var name      = response['localuser_' + i + '_name'     ].value;
  var is_admin  = response['localuser_' + i + '_admin'    ].checked;
  var password1 = response['localuser_' + i + '_password1'].value;
  var password2 = response['localuser_' + i + '_password2'].value;

  var error_element
    = document.querySelector('div[id=localuser_' + i + '_errors]');

  var errors = [];

  if (login.match(/^\s*$/) && name.match(/^\s*$/))
    next_user_fn();

  if (!login.match(/^[a-z\.-]+$/))
    errors.push('Login is not in correct format.');

  if (!name.match(/^[a-zA-Z\. -]+$/))
    errors.push('Name is not in correct format.');

  if (password1 !== password2)
    errors.push('Passwords do not match.');

  if (errors.length > 0) {
    error_element.textContent = errors.join(' / ');
    has_errors = true;
  }

  if (is_admin)
    new_config.admins.push(login);

  new_config.allow_logins_for.push(login);

  hash_password(password1,
                old_config.local_users[i].hashed_password,
                function(hp) {
                  new_config.local_users.push({
                    hashed_password: hp,
                    login:           login,
                    name:            name,
                  });
                  next_user_fn();
               });
}

function assemble_config_and_exit(old_config) {
  var response = document.forms[0].elements;
  var new_config = {
    admins:             [],
    allow_logins_for:   [],
    allow_remoteadmins: false,
    licenses:           {},
    local_users:        [],
    version:            1,
  };

  var do_after_local_users_are_ok =
    function(has_errors) {
      if (has_errors) { return; }

      switch(response.allow_logins_for.value) {
        case 'all_puavo_domain_users':
          new_config.allow_logins_for = [ '*' ];
          break;
        case 'some_puavo_domain_users':
          var allowed_puavo_users = [];
          for (i in response.allowed_puavo_users) {
            var user = response.allowed_puavo_users[i].value;
            if (user && user.match(/\S+/)) { allowed_puavo_users.push(user); }
          }

          var local_users = new_config.local_users
                                      .map(function(lu) { return lu.login; });

          new_config.allow_logins_for
            = allowed_puavo_users.concat(local_users);

          break;
      }

      new_config.allow_remoteadmins = response.allow_remoteadmins.checked;

      write_config_json_and_exit(new_config);
    };

  make_local_users_config(response,
                          0,
                          old_config,
                          new_config,
                          false,
                          do_after_local_users_are_ok);
}

/*
  // allow_logins_for
  new_config.allow_logins_for
    = response.allow_logins_for.value === 'all_puavo_domain_users'
        ? [ '*' ]
        : [];

  // allow_remoteadmins
  new_config.allow_remoteadmins = response.allow_remoteadmins.checked;

  // licenses
  new_config.licenses = {};
  var license_checkboxes
    = document.querySelectorAll('input[class=license_acceptance_checkbox]');
  [].forEach.call(license_checkboxes,
                  function(lc) {
                    var name = lc.getAttribute('name');
                    new_config.licenses[name] = response[name].checked; });

  // admins
  new_config.admins
    = response['localuser_0_admin'].checked
        ? [ response['localuser_0_login'].value ]
        : [];
*/

function check_download_packs(cb) {
  var handler
    = function (error, stdout, stderr) {
        if (error) { throw(error); }

        obj = {};
        stdout.toString()
              .split("\n")
              .forEach(function (line) {
                         if (line !== '') {
                           a = line.split(/\s+/);
                           obj[ a[0] ] = (a[2] !== 'PURGED');
                         }
                       });
        cb(obj);
      };

  child_process.execFile('puavo-restricted-package-tool',
                         [ 'list' ],
                         {},
                         handler);
}

function configure_system_and_exit() {
  process.exit(0);

  var cmd_args = [ '/usr/sbin/puavo-local-config'
                 , '--admins'
                 , '--local-users'
                 , '--setup-pkgs', 'all' ];

  var handler
    = function(error, stdout, stderr) {
        if (error) { throw(error); }
        process.exit(0);
      };

  child_process.execFile('sudo', cmd_args, {}, handler);
}

function diff_arrays(a, b) {
  return a.filter(function(i) { return b.indexOf(i) < 0; });
};

function download_pkg(license_key, button, styles, error_element) {
  button.textContent = 'Downloading...';
  button.setAttribute('style', styles.download_a);

  var flashes
    = function() {
        if (button.getAttribute('style') === styles.download_a) {
          button.setAttribute('style', styles.download_b);
        } else if (button.getAttribute('style') == styles.download_b) {
          button.setAttribute('style', styles.download_a);
        }
      };

  var flash_interval = setInterval(flashes, 500);

  var cmd_args = [ '/usr/sbin/puavo-local-config'
                 , '--download-pkgs'
                 , license_key ]

  var handler
    = function(error, stdout, stderr) {
        if (error) {
          button.setAttribute('style', styles.error);
          button.textContent = 'ERROR';
          error_element.textContent = stderr;
        } else {
          button.setAttribute('style', styles.ok);
          button.textContent = 'INSTALLED';
          error_element.textContent = '';
        }
        clearInterval(flash_interval);
      };

  child_process.execFile('sudo', cmd_args, {}, handler);
}

function generate_allow_logins_input(form, old_config) {
  var table = document.createElement('table');

  var make_radiobutton
    = function(tr, value, text, checked) {
        var input = document.createElement('input');
        if (checked) {
          input.setAttribute('checked', true);
        } else {
          input.removeAttribute('checked');
        }
        input.setAttribute('name', 'allow_logins_for');
        input.setAttribute('type', 'radio');
        input.setAttribute('value', value);

        var tr = table.appendChild( document.createElement('tr') );
        var td = tr   .appendChild( document.createElement('td') );

        var textnode = document.createTextNode(text);
        td.appendChild(input);
        td.appendChild(textnode);

        return tr;
      };

  var all_is_chosen = (old_config.allow_logins_for.indexOf('*') >= 0);

  make_radiobutton(table,
                   'all_puavo_domain_users',
                   'All puavo domain users',
                   all_is_chosen);

  var rb_tr = make_radiobutton(table,
                               'some_puavo_domain_users',
                               'Some puavo domain users:',
                               !all_is_chosen);

  var nonlocal_users_allowed_logins = [];
  if (!all_is_chosen) {
    var local_user_names
      = old_config.local_users.map(function(lu) { return lu.login });
    nonlocal_users_allowed_logins
      = diff_arrays(old_config.allow_logins_for, local_user_names);
  }

  make_listwidgets(rb_tr,
                   'allowed_puavo_users',
                   nonlocal_users_allowed_logins);

  var title = document.createElement('div');
  title.textContent = 'Allow logins for:';
  title.appendChild(table);

  form.appendChild(title);

  form.appendChild( document.createElement('hr') );
}

function generate_allow_remoteadmins_input(form, old_config) {
  var div = document.createElement('div');
  var titletext = document.createTextNode('Allow login from remote admins:');
  div.appendChild(titletext);

  var input = document.createElement('input');
  input.setAttribute('name', 'allow_remoteadmins');
  input.setAttribute('type', 'checkbox');
  if (old_config.allow_remoteadmins) {
    input.setAttribute('checked', true);
  } else {
    input.removeAttribute('checked');
  }

  div.appendChild(input);
  form.appendChild(div);

  form.appendChild( document.createElement('hr') );
}

function generate_form(old_config) {
  // XXX add_licenses(get_license_list());

  var form = document.querySelector('form[id=dynamic_form]');

  generate_login_users_input(form, old_config);
  generate_allow_logins_input(form, old_config);
  generate_allow_remoteadmins_input(form, old_config);
  generate_done_button(form, old_config);
}

function generate_login_users_input(form, old_config) {
  var title = document.createElement('div');
  var titletext = document.createTextNode('Local users:');
  title.appendChild(titletext);

  var add_button = document.createElement('input');
  add_button.setAttribute('type', 'button');
  add_button.setAttribute('value', 'Add another user');
  title.appendChild(add_button);

  form.appendChild(title);

  var user_inputs = document.createElement('div');
  form.appendChild(user_inputs);

  var local_users = old_config.local_users;

  var append_empty_user
    = function() { 
        local_users.push({ hashed_password: '', login: '', name: '', }); }

  // create at least one empty user
  if (local_users.length === 0) { append_empty_user(); }

  for (i in local_users)
    generate_one_user_create_table(user_inputs, old_config, i);
 
  var add_new_user
    = function(e) {
        e.preventDefault();
        append_empty_user();
        var last_i = local_users.length - 1;
        generate_one_user_create_table(user_inputs, old_config, last_i);
      };

  add_button.addEventListener('click', add_new_user);
}

function generate_one_user_create_table(parentNode, old_config, user_i) {
  var div = document.createElement('div');
  div.setAttribute('id', 'localuser_' + user_i + '_errors');
  parentNode.appendChild(div);

  var table = document.createElement('table');

  var old_user_data = old_config.local_users[user_i];
  
  var fields = [
    {
      name:     'Login:',
      key:      'login',
      type:     'text',
      value_fn: function(input) { 
                  input.setAttribute('value', old_user_data.login) },
    },
    {
      name:     'Name:',
      key:      'name',
      type:     'text',
      value_fn: function(input) {
                  input.setAttribute('value', old_user_data.name) },
    },
    {
      name:     'Has administrative rights:',
      key:      'admin',
      type:     'checkbox',
      value_fn: function(input) {
                  if (old_config.admins.indexOf(old_user_data.login) >= 0) {
                    input.setAttribute('checked', true);
                  } else {
                    input.removeAttribute('checked');
                  }
                },
    },
    {
      name: 'Password:',
      key:  'password1',
      type: 'password',
    },
    {
      name: 'Password again:',
      key:  'password2',
      type: 'password',
    },
  ];

  var make_input
    = function(field, i, type, value_fn) {
        input = document.createElement('input');
        input.setAttribute('name', 'localuser_' + i + '_' + field);
        input.setAttribute('type', type);
        if (value_fn) { value_fn(input); }
        return input;
      };
 
  fields.forEach(function (fieldinfo) { 
                   var tr = document.createElement('tr');

                   var name_td = document.createElement('td');
                   name_td.textContent = fieldinfo.name;
                   tr.appendChild(name_td);

                   var input_td = document.createElement('td');
                   var input = make_input(fieldinfo.key,
                                          user_i,
                                          fieldinfo.type,
                                          fieldinfo.value_fn);

                   input_td.appendChild(input);
                   tr.appendChild(input_td);

                   table.appendChild(tr);
                 });

  parentNode.appendChild(table);
  parentNode.appendChild( document.createElement('hr') );
}

function generate_done_button(form, old_config) {
  var input = document.createElement('input');
  input.setAttribute('type',  'button');
  input.setAttribute('value', 'Done!');

  input.addEventListener('click',
                         function() { assemble_config_and_exit(old_config) });

  form.appendChild(input);
}

function get_license_list() {
  var basedir = '/usr/share/puavo-ltsp-client/restricted-packages';
  try {
    var software_directories = fs.readdirSync(basedir);
  } catch (ex) {
    alert(ex);
    return [];
  };

  var list = [];

  for (var i in software_directories) {
    var dir = software_directories[i];
    var dir_fullpath = basedir + '/' + dir;
    if (! fs.statSync(dir_fullpath).isDirectory())
      continue;

    var license_path = dir_fullpath + '/license.json';
    try {
      var license_info = JSON.parse(fs.readFileSync(license_path));
    } catch(ex) { alert(ex); continue; }

    if (license_info && license_info.name && license_info.url) {
      license_info.key = dir;
      list.push(license_info);
    } else {
      alert('License information was not in correct format in '
              + license_path);
    }
  }

  return list;
}

function hash_password(password, old_hashed_password, cb) {
  // if user did not provide a password,
  // use the password from old configuration
  if (password === '') { return cb(old_hashed_password); }

  var handler
    = function (error, stdout, stderr) {
        if (error) { throw(error); }
        cb(stdout.toString().replace(/\n$/, ''));
      };

  var child = child_process.execFile('mkpasswd',
                                     [ '-m', 'sha-512', '-s' ],
                                     {},
                                     handler);

  child.stdin.end(password);
}

function make_listwidgets(parentNode, fieldname, initial_values) {
  var listwidgets = [];

  var make_listwidget
    = function(value) {
        var table = document.createElement('table');
        var tr    = table.appendChild( document.createElement('tr')    );
        var td    = tr   .appendChild( document.createElement('td')    );
        var input = td   .appendChild( document.createElement('input') );
        input.setAttribute('name', fieldname);
        input.setAttribute('type', 'text');
        input.setAttribute('value', value);
        input.addEventListener('focusout',
                               function(ev) { update_listwidgets(); });
        input.addEventListener('keyup',
                               function(ev) { update_listwidgets(); });

        parentNode.appendChild(table);

        return { input: input, table: table, };
      };

  var update_listwidgets
    = function() {
        var one_empty_listwidget = false;

        for (i in listwidgets) {
          if (listwidgets[i].input.value.match(/^\s*$/)) {
            if (one_empty_listwidget) {
              var table = listwidgets[i].table;
              delete listwidgets[i];
              table.parentNode.removeChild(table);
            } else {
              one_empty_listwidget = true;
            }
          }
        }

        if (!one_empty_listwidget) {
          listwidgets.push( make_listwidget('') );
        }
      };

  for (v in initial_values)
    listwidgets.push( make_listwidget(initial_values[v]) );

  update_listwidgets();
}

function open_external_link(e) {
  var child = child_process.spawn('x-www-browser',
                                  [ e.href ],
                                  { detached: true, stdio: 'ignore' });
  child.unref();
}

function read_config() {
  var config;

  try {
    config = JSON.parse( fs.readFileSync(config_json_path) );
  } catch (ex) {
    if (ex.code !== 'ENOENT') {
      alert(ex);
      return false;
    } else {
      // default config in case everything is missing
      config = {
        admins:             [],
        allow_logins_for:   [ '*' ],
        allow_remoteadmins: false,
        licenses:           {},
        local_users:        [],
      };
    }
  }

  return config;
}

function set_form_values_from_config(config) {
  // allow_logins_for
  allow_logins_for
    = config.allow_logins_for.indexOf('*') >= 0
        ? 'all_puavo_domain_users'
        : 'some_puavo_domain_users';

  [].forEach.call(document.querySelectorAll('input[name=allow_logins_for]'),
                  function(e) {
                    if (e.getAttribute('value') === allow_logins_for)
                      e.setAttribute('checked', true); });

  // local_users
  for (var i in config.local_users) {
    var login = config.local_users[i].login;
    var name  = config.local_users[i].name;

    document.querySelector('input[name=localuser_' + i + '_login')
            .setAttribute('value', login);
    document.querySelector('input[name=localuser_' + i + '_name')
            .setAttribute('value', name);

    // check if user if found in the admins array
    if (config.admins.indexOf(login) >= 0) {
      document.querySelector('input[name=localuser_' + i + '_admin')
              .setAttribute('checked', true);
    } else {
      document.querySelector('input[name=localuser_' + i + '_admin')
              .removeAttribute('checked');
    }
  }

  // allow_remoteadmins
  var allow_remoteadmins_checkbox
    = document.querySelector('input[name=allow_remoteadmins]');
  if (config.allow_remoteadmins) {
    allow_remoteadmins_checkbox.setAttribute('checked', true);
  } else {
    allow_remoteadmins_checkbox.removeAttribute('checked');
  }

  // licenses
  var license_checkboxes
    = document.querySelectorAll('input[class=license_acceptance_checkbox]');
  [].forEach.call(license_checkboxes,
                  function(lc) {
                    var name = lc.getAttribute('name');
                    if (name in config.licenses && config.licenses[name]) {
                      lc.setAttribute('checked', true);
                    } else {
                      lc.removeAttribute('checked');
                    }
                  });
}

function write_config_json_and_exit(conf) {
  try {
    var data = JSON.stringify(conf) + "\n";
    var tmpfile = config_json_path + '.tmp';
    fs.writeFileSync(tmpfile, data);
    fs.renameSync(tmpfile, config_json_path);
  } catch (ex) { alert(ex); throw(ex); }

  configure_system_and_exit();
}


var old_config = read_config();
if (!old_config) { process.exit(1); }

generate_form(old_config);

(function() {
  return {
    customFieldRegExp: new RegExp(/custom_field_([0-9]+)/),
    dateRegExp : new RegExp(/([0-9]:00:00 GMT[\+\-])/),
    events: {
      'app.created':'loadOptions',
      'ticket.save':'onTicketSave'
    },
    requests: {
      getAddresses: function() {
        return {
          url: '/api/v2/recipient_addresses.json'
        };
      },
      getTicket: function() {
        return {
          url: helpers.fmt('/api/v2/tickets/%@.json', this.ticket().id())
        };
      },
      createTicket: function(data) {
        return {
          url: '/api/v2/tickets.json',
          dataType: 'json',
          type: 'POST',
          data: JSON.stringify(data),
          contentType: 'application/json'
        };
      },
      updateTicket: function(data, id) {
        return {
          url: helpers.fmt('/api/v2/tickets/%@.json', id),
          dataType: 'json',
          type: 'PUT',
          data: JSON.stringify(data),
          contentType: 'application/json'
        };
      }
    },
    loadOptions: function() {
      this.ajax('getAddresses').done(function(response) {
        this.addresses = response.recipient_addresses;
        var defaultAddress;
        var recipientAddress;
        var otherAddresses;
        var newTicket;
        if(this.currentLocation() == 'new_ticket_sidebar') {
          newTicket = true;
          defaultAddress = _.filter(this.addresses, function(address) { return address.default === true;});
          otherAddresses = _.filter(this.addresses, function(address) { return address.default !== true;});

          this.switchTo('pickOne', {
            newTicket: newTicket,
            defaultAddress: defaultAddress,
            recipientAddress: recipientAddress,
            addresses: otherAddresses
          });

        } else if (this.currentLocation() == 'ticket_sidebar') {
          newTicket = false;
          this.ajax('getTicket').done(function(response) {
            // GET the ticket's recipient
            // set that as the default address (maybe change the wording?)

            var currentAddress = response.ticket.recipient;
            recipientAddress = _.filter(this.addresses, function(address) { return address.email == currentAddress;});
            otherAddresses = _.filter(this.addresses, function(address) { return address.email != currentAddress;});

            this.switchTo('pickOne', {
              newTicket: newTicket,
              defaultAddress: defaultAddress,
              recipientAddress: recipientAddress,
              addresses: otherAddresses
            });
          });
        }
      });
    },
    onTicketSave: function() {
      return this.promise(function(done, fail){
        var self = this,
        attributes = {};
        var location = this.currentLocation(),
            newTickets = this.setting("new_tickets?"),
            existingTickets = this.setting("existing_tickets?");
        console.log("New Tickets? " + newTickets);
        console.log("Existing Tickets? " + existingTickets);
        if (this.shouldCreateTicket(done, fail)){
          // If the location is NEW ticket the app should create a ticket
          if(location == 'new_ticket_sidebar' && newTickets === true) {
            try {
              attributes = this.serializeTicketAttributes(location);
              this.ajax('createTicket', attributes)
                .done(function(data){
                  fail(this.I18n.t('notice.ticket_created', { id: data.ticket.id, email: data.ticket.recipient }));
                  // services.notify();
                  self.clearAttributes();
                })
                .fail(function(data){
                  fail(data.responseText);
                });
            } catch(e) {
              fail(e.message);
            }
          } else if(location == 'ticket_sidebar' && existingTickets === true) {
          // if location is not new_ticket_sidebar it should update the existing ticket
            var id = this.ticket().id();
            try {
              attributes = this.serializeTicketAttributes(location);
              this.ajax('updateTicket', attributes, id)
                .done(function(data){
                  services.notify(this.I18n.t('notice.ticket_updated', { id: data.ticket.id, email: data.ticket.recipient }));
                  done('Used the Brand App to change the email.');
                  
                  // this.comment().text('');
                })
                .fail(function(data){
                  fail(data.responseText);
                });
            } catch(e) {
              fail(e.message);
            }
          } else {
            done();
          }
        }
      });
    },
    shouldCreateTicket: function(done, fail){
      if (_.isEmpty(this.brandEmail())) {
        if (this.setting('force_selection_of_brand')) {
          fail(this.I18n.t('errors.brand'));
        } else {
          done();
        }
        return false;
      } else {
        return true;
      }
    },
    serializeTicketAttributes: function(location){
      var ticket = this.ticket();
      var attributes = {};
      if(location == 'new_ticket_sidebar') { // if the location is new set certain attributes
        attributes = {
          subject: ticket.subject(),
          comment: this.serializeCommentAttributes(),
          description: this.comment().text(), // not for existing tickets
          priority: ticket.priority(),
          status: ticket.status(),
          tags: ticket.tags(),
          type: ticket.type(),
          collaborators: _.map(ticket.collaborators(), function(cc) { return cc.email(); }),
          ticket_form_id: (ticket.form() && ticket.form().id()) || null,
          assignee_id: (ticket.assignee().user() && ticket.assignee().user().id()) || null,
          group_id: (ticket.assignee().group() && ticket.assignee().group().id()) || null,
          recipient: this.brandEmail(),
          custom_fields: this.serializeCustomFields(),
          submitter_id: this.currentUser().id()
        };
      } else { // if the location is not new just set recipient
        var recipient = this.brandEmail();
        if(recipient) {
          attributes.recipient = recipient;
        }
      }
      if (ticket.requester()) {
        if (ticket.requester().id()) {
          attributes.requester_id = ticket.requester().id();
        } else if (ticket.requester().email()) {
          attributes.requester = {
            email: ticket.requester().email(),
            name: ticket.requester().email().split('@')[0]
          };
        } else if (this._isEmpty(ticket.requester().email()) &&
                   this.setting('mandatory_requester_email')) {
          throw({ message: this.I18n.t('errors.requester_email') });
        }
      }
      return { ticket: attributes };
    },
    serializeCommentAttributes: function() {
      var comment = this.comment();
      var public = true;
      if (comment.type() == "internalNote") {
        public = 'false';
      }
      var attributes = { body: comment.text(), public: public };
      if (comment.attachments().length > 0) {
        attributes.uploads = [];

        _.each(comment.attachments(), function(attachment) {
          attributes.uploads.push(attachment.token());
        });
      }
      return attributes;
    },
    // serializeCustomFields: function(){
    //   var fields = [];
    //   this.forEachCustomField(function(field){
    //     if (!this._isEmpty(field.value)){
    //       // TODO: add condition for dates here

    //       fields.push({
    //         id: field.id,
    //         value: field.value
    //       });
    //     }
    //   });
    //   return fields;
    // },

    serializeCustomFields: function(){
      var fields = [];

      this.forEachCustomField(function(field){
        if (field.value !== ""){
          var test = ""+field.value+"";
          var isDate = "";
          if(field.value !== undefined){
              isDate = test.match(this.dateRegExp);
          }
          var value = "";
          if(isDate !== "" && isDate !== null){
            var date = new Date(field.value);
            var year = date.getFullYear();
            var month = (1 + date.getMonth()).toString();
            month = month.length > 1 ? month : '0' + month;
            var day = date.getDate().toString();
            day = day.length > 1 ? day : '0' + day;
            value = year+"-"+month+"-"+day;
          }else{
            value = field.value;
          }
          fields.push({
            id: field.id,
            value: value
          });
        }
      });
      // debugger;
      console.log(fields);
      return fields;
    },


    forEachCustomField: function(block){
      _.each(this._customFields(), function(field){
        var id = field.match(this.customFieldRegExp)[1],
            value = this.normalizeValue(this.ticket().customField(field));

        block.call(this, {
          label: field,
          id: id,
          value: value
        });
      }, this);
    },
    normalizeValue: function(value){
      return {
        "yes": true,
        "no": false
      }[value] || value;
    },
    clearAttributes: function(){
      // clear CCs
      var collos = this.ticket().collaborators();
      for(var i = 0; i < collos.length; i++){
          this.ticket().collaborators().remove({ email: collos[i].email() });
      }
      // clear system fields
      this.ticket().subject('');
      this.comment().text('');
      this.ticket().priority('-');
      this.ticket().type('ticket');
      this.ticket().requester({ email: ''});
      this.ticket().tags([]);
      this.ticket().status('new');
      // clear custom fields
      this.forEachCustomField(function(field){
        this.ticket().customField(field.label, '');
      });
    },
    brandEmail: function(){
      var fieldValue = this.$('select.address').val();
      return fieldValue;
    },
    _customFields: _.memoize(function(){
      return _.filter(_.keys(this.containerContext().ticket), function(field){
        return field.match(this.customFieldRegExp);
      }, this);
    }),
    _brand: function(){
      return this.ticket().customField('custom_field_%@'.fmt(this.setting('brand_field_id')));
    },
    _isEmpty: function(field){
      return _.isUndefined(field) ||
        _.isNull(field) ||
        field === '-';
    },
    _mapping: _.memoize(function(){
      return JSON.parse(this.setting('mapping'));
    })
  };
}());

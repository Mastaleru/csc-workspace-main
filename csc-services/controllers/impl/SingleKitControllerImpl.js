const AccordionController  = require("./helpers/AccordionController");
const cscServices = require('csc-services');
const KitsService = cscServices.KitsService;
const viewModelResolver = cscServices.viewModelResolver;
const { shipmentStatusesEnum } = cscServices.constants.shipment;
const momentService = cscServices.momentService;
const { Commons, Topics, Roles } = cscServices.constants;
const {kitsStatusesEnum, kitsPendingActionEnum} = cscServices.constants.kit;
const statusesService = cscServices.StatusesService;

class SingleKitControllerImpl extends AccordionController {

  constructor(actor, ...props) {
    super(...props);
    this.actor = actor;

    this.kitsService = new KitsService(this.DSUStorage);
    this.initViewModel();
    this.openFirstAccordion();
    this.attachEventListeners();
  }

  attachEventListeners() {
    this.toggleAccordionItemHandler();
    this.navigationHandlers();
  }

  navigationHandlers() {
    this.onTagClick('dashboard', () => {
      this.navigateToPageTag('dashboard', { tab: Topics.Shipment });
    });

    this.onTagClick('kits-management', () => {
      this.navigateToPageTag('dashboard', { tab: Topics.Kits });
    });

    this.onTagClick('view-study-kits', () => {
      this.navigateToPageTag('study-kits', {
        studyId: this.model.kitModel.kit.studyId,
        orderId: this.model.kitModel.kit.orderId
      });
    });

  }

  attachSiteEventHandlers(){
    this.onTagClick('manage-kit', () => {
      this.navigateToPageTag('scan-kit', {
        kit: {
          kitId: this.model.kitModel.kit.kitId,
          ...this.model.toObject('kitModel.kit')
        }
      });
    });

    this.onTagClick('assign-kit', () => {
      this.navigateToPageTag('assign-kit', {
        kit: {
          kitId: this.model.kitModel.kit.kitId,
          ...this.model.toObject('kitModel.kit')
        }
      });
    });

    this.onTagClick('dispense-kit', () => {
      this.navigateToPageTag('dispense-kit', {
        kit: {
          kitId: this.model.kitModel.kit.kitId,
          ...this.model.toObject('kitModel.kit')
        }
      });
    });


    this.onTagEvent('history-button', 'click', (e) => {
        this.onShowHistoryClick();
    });

  }

  async initViewModel() {
    const model = {
      kitModel: viewModelResolver('kit')
    };

    let { uid } = this.history.location.state;
    model.uid = uid;
    model.kitModel.kit = await this.kitsService.getKitDetails(model.uid);
    model.kitModel.kit = { ...this.transformKitData(model.kitModel.kit) };

    if (model.kitModel.kit.shipmentComments) {
      model.kitModel.kit.comments = this.getShipmentComments(model.kitModel.kit);
    }
    if (model.kitModel.kit.kitComment) {
      model.kitModel.kit.kitcomments = this.getKitComments(model.kitModel.kit);
    }
    if(this.actor === Roles.Site){
      model.actions = this.setKitActions(model.kitModel.kit);
    }

    if(this.actor === Roles.Sponsor){
      model.actions = this.setKitActions(model.kitModel.kit);
    }

    this.model = model;
  }

  setKitActions(kit) {
    const actions = {};
    actions.canDispenseKit = kit.status_value === kitsStatusesEnum.Assigned;
    actions.canAssignKit = kit.status_value === kitsStatusesEnum.AvailableForAssignment;
    actions.canManageKit = kit.status_value === kitsStatusesEnum.Received;
    actions.canDispenseKit = kit.status_value === kitsStatusesEnum.Assigned;
    this.attachSiteEventHandlers();
    return actions;
  }

  getShipmentComments(kit) {
    let comments = kit.shipmentComments;
    comments.forEach((comment) => {
      comment.date = momentService(comment.date).format(Commons.DateTimeFormatPattern);
    });
    return comments;
  }

  getKitComments(kit) {
    let comment = kit.kitComment;
    comment.date = momentService(comment.date).format(Commons.DateTimeFormatPattern);
    return comment;
  }

  getDateTime(timestamp) {
    return {
      date: momentService(timestamp).format(Commons.YMDDateTimeFormatPattern),
      time: momentService(timestamp).format(Commons.HourFormatPattern)
    };
  }

  transformKitData(data) {
    if (data) {
      data.status_value = data.status.sort((function (a, b) {
        return new Date(b.date) - new Date(a.date);
      }))[0].status;

      data.status_date = momentService(data.status.sort((function (a, b) {
        return new Date(b.date) - new Date(a.date);
      }))[0].date).format(Commons.DateTimeFormatPattern);

      if (data.receivedDateTime) {
        data.receivedDateTime = this.getDateTime(data.receivedDateTime)
      }

      data.pending_action = this.getPendingAction(data.status_value);
      const statuses = statusesService.getKitStatuses();
      const normalStatuses = statuses.normalKitStatuses;
      const approvedStatuses = statuses.approvedKitStatuses;
      data.status_approved = approvedStatuses.indexOf(data.status_value) !== -1;
      data.status_cancelled = data.status_value === kitsStatusesEnum.Cancelled;
      data.status_normal = normalStatuses.indexOf(data.status_value) !== -1;
      data.contextualContent = {
         afterReceived: data.status.findIndex(el => el.status === kitsStatusesEnum.Received) !== -1,
         afterAvailableForAssignment: data.status.findIndex(el => el.status === kitsStatusesEnum.AvailableForAssignment) !== -1,
         afterAssigned: data.status.findIndex(el => el.status === kitsStatusesEnum.Assigned) !== -1,
         afterDispensed: data.status.findIndex(el => el.status === kitsStatusesEnum.Dispensed) !== -1
       };
      return data;
    }
    return {};
  }

  getPendingAction(status_value) {
    switch (status_value) {
      case kitsStatusesEnum.Received:
        return kitsPendingActionEnum.ManageKit;
      case kitsStatusesEnum.AvailableForAssignment:
        return kitsPendingActionEnum.Assign;
      case kitsStatusesEnum.Assigned:
        return kitsPendingActionEnum.Dispense;
    }

    return kitsPendingActionEnum.NoFurtherActionsRequired;
  }

  onShowHistoryClick() {
      let { kitModel } = this.model.toObject();

      const historyModel = {
        kit: kitModel.kit,
        currentPage: Topics.Kits
      };

      this.createWebcModal({
        template: 'kitHistoryModal',
        controller: 'KitHistoryModalController',
        model: historyModel,
        disableBackdropClosing: false,
        disableFooter: true,
        disableExpanding: true,
        disableClosing: false,
        disableCancelButton: true,
        expanded: false,
        centered: true
      });
    }
}

const controllersRegistry = require('../ControllersRegistry').getControllersRegistry();
controllersRegistry.registerController('SingleKitController', SingleKitControllerImpl);

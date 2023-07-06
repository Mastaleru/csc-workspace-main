import constants from "../../constants.js";
import utils from "../../utils.js";
import {cloneTemplate} from "../../../components/utils.js";
import getStorageService from "../../services/StorageService.js";
import MessagesService from "../../services/MessagesService.js";

const {DwController} = WebCardinal.controllers;
const {promisify} = utils;

class GroupsUI extends DwController {
  constructor(...props) {
    super(...props);
  }

  // listeners

  // addBlockchainDomainListener() {
  //   const inputElement = this.getElementByTag("blockchain-domain");
  //
  //   const nativeElement = inputElement.shadowRoot.querySelector("[part=input]");
  //   if (!(nativeElement instanceof HTMLElement)) return;
  //
  //   const buttonElements = inputElement.querySelectorAll("sl-button");
  //   const [editButtonElement, saveButtonElement] = buttonElements;
  //
  //   editButtonElement.addEventListener("click", (event) => {
  //     event.stopPropagation();
  //     editButtonElement.setAttribute("hidden", "");
  //     saveButtonElement.removeAttribute("hidden");
  //     inputElement.disabled = false;
  //     setTimeout(() => {
  //       nativeElement.focus();
  //       nativeElement.setSelectionRange(0, nativeElement.value.length);
  //     });
  //   });
  //
  //   saveButtonElement.addEventListener("click", (event) => {
  //     event.stopPropagation();
  //     saveButtonElement.setAttribute("hidden", "");
  //     editButtonElement.removeAttribute("hidden");
  //     inputElement.disabled = true;
  //   });
  // }

  addGroupContentListener() {
    const key = "dw:groups:active-tab";
    const part = "group-content";
    const rootElement = this.querySelector(`#dw-${part}`);
    const subParts = {
      [part]: ["group-members", "group-credentials", "group-databases"],
    };

    this.model.onChange("selectedGroup", ({targetChain}) => {
      if (targetChain !== "selectedGroup") {
        return;
      }

      rootElement.innerHTML = "";

      this.updateState("selectedGroup", this.model.selectedGroup);

      if (!this.model.selectedGroup) {
        return;
      }

      const documentFragment = cloneTemplate(part);

      for (const subPart of subParts[part]) {
        const parentElement = documentFragment.querySelector(`#dw-${subPart}`);
        parentElement.append(cloneTemplate(subPart));
      }


      rootElement.hidden = true;
      rootElement.append(documentFragment);

      const tabGroupElement = rootElement.querySelector("sl-tab-group");
      const storedActiveTab = localStorage.getItem(key);

      tabGroupElement.addEventListener("sl-tab-show", (event) => {
        const tab = event.detail.name;

        if (tab === "members") {
          localStorage.removeItem(key);
        }

        localStorage.setItem(key, tab);
      });

      if (tabGroupElement && storedActiveTab) {
        setTimeout(async () => {
          await tabGroupElement.show(storedActiveTab);
          rootElement.hidden = false;
        });
      } else {
        rootElement.hidden = false;
      }
    });
  }

  // methods

  async addGroup(model, target) {
    return await this.ui.submitGenericForm(model, target);
  }

  async selectGroup(model, target) {
    if (target.checked) {
      target.checked = false;
      return undefined;
    }

    Array.from(target.parentElement.parentElement.children).forEach((item) => {
      item.firstElementChild.checked = false;
    });

    target.checked = true;
    return model;
  }
}

class GroupsController extends DwController {
  constructor(...props) {
    super(...props);
    const {ui} = this;

    this.model = {
      // blockchainDomain: "example.domain",
      groups: [],
      selectedGroup: undefined,
      areGroupsLoaded: false,
    };

    ui.page = new GroupsUI(...props);
    // ui.page.addBlockchainDomainListener();
    ui.page.addGroupContentListener.call(this);


    this.onTagClick("group.add", async (...props) => {
      try {
        const {name} = await ui.page.addGroup(...props);
        const group = await $$.promisify(this.addGroup)({name});
        this.model.selectedGroup = undefined;
        this.model.groups.push(group);
        // await ui.showToast(group);
      } catch (err) {
        console.log(err);
      }
    });

    const groupSelect = document.querySelector('select');
    groupSelect.addEventListener('change', event => {
      const groups = JSON.parse(JSON.stringify(this.model.groups))
      this.model.selectedGroup = groups.find((group)=> group.name === event.target.value);
    });


    this.onTagClick("group.delete", async (deletedGroup) => {
      try {
        await this.deleteGroup(deletedGroup);
        this.model.selectedGroup = undefined;
        this.model.groups = this.model.groups.filter((group) => group.did !== deletedGroup.did);
        // await ui.showToast(deletedGroup);
      } catch (err) {
        console.log(err);
      }
    });

    const __waitForSharedEnclave = () => {
      setTimeout(async () => {
        const scAPI = require("opendsu").loadAPI("sc");
        if (scAPI.sharedEnclaveExists()) {
          this.model.groups = await utils.fetchGroups();
          this.model.defaultGroup = this.model.groups[0];
          this.model.selectedGroup = this.model.groups[0]
          this.model.areGroupsLoaded = true;
        } else {
          __waitForSharedEnclave();
        }
      }, 100);
    }
    __waitForSharedEnclave();
  }

  /**
   * @param {object} group
   * @param {string} group.name
   **/
  async addGroup(group, callback) {
    const createGroupMessage = {
      messageType: "CreateGroup",
      groupName: group.name,
    };

    const scAPI = require("opendsu").loadAPI("sc");
    if (group.name === constants.EPI_ADMIN_GROUP) {
      scAPI.getMainEnclave((err, mainEnclave) => {
        if (err) {
          return callback(err);
        }
        return processMessages(mainEnclave, callback);
      })
    } else {
      scAPI.getSharedEnclave((err, sharedEnclave) => {
        if (err) {
          return callback(err);
        }
        processMessages(sharedEnclave, callback);
      })
    }
    const processMessages = (storageService, callback) => {
      MessagesService.processMessages(storageService, [createGroupMessage], async () => {
        const openDSU = require("opendsu");
        const scAPI = openDSU.loadAPI("sc");
        const enclaveDB = await $$.promisify(scAPI.getMainEnclave)();
        const sharedEnclaveDB = await $$.promisify(scAPI.getSharedEnclave)();
        const groups = await promisify(sharedEnclaveDB.getAllRecords)(constants.TABLES.GROUPS);
        group.did = groups.find((gr) => gr.name === group.name).did;
        const adminDID = await enclaveDB.readKeyAsync(constants.IDENTITY);

        const addMemberToGroupMessage = {
          messageType: constants.MESSAGE_TYPES.ADD_MEMBER_TO_GROUP,
          groupDID: group.did,
          memberDID: adminDID.did,
          memberName: adminDID.username,
          auditData: {
            action: constants.OPERATIONS.ADD,
            userGroup: this.model.selectedGroup.name,
            userDID: null,
          }
        };
        await MessagesService.processMessages([addMemberToGroupMessage], async () => {
          callback(undefined, group);
        });
      });
    }
  }

  /**
   * @param {object} group
   * @param {string} group.did
   **/
  async deleteGroup(group) {
    const deleteGroupMessage = {
      messageType: "DeleteGroup",
      groupDID: group.did,
      auditData: {
        action: constants.OPERATIONS.REMOVE,
        userGroup: this.model.selectedGroup.name,
        userDID: null
      }
    };
    await MessagesService.processMessages([deleteGroupMessage], () => {
    });
  }
}

export default GroupsController;
